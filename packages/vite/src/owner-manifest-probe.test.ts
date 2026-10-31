import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import type { OwnerManifestCapture, OwnerManifestLease } from '@hozo/compiler/project'
import { build, type Plugin } from 'vite'
import { hozo } from './index.ts'
import { ownerManifestGraphProbe } from './owner-manifest-probe.ts'

const text = readFileSync(
  new URL('../../../scripts/style-slots/owner-shadow.json', import.meta.url),
  'utf8',
)
function json(file, value) {
  writeFileSync(file, JSON.stringify(value))
}
function fixture(t) {
  const root = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'hozo-owner-vite-')))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const roots: { root: string }[] = [{ root }]
  function pkg(dir, name, imports = '', participant = true, version = '1.0.0') {
    mkdirSync(dir, { recursive: true })
    roots.push({ root: dir })
    json(path.join(dir, 'package.json'), {
      name,
      version,
      type: 'module',
      ...(participant ? { hozo: { manifest: 'owner.json' } } : {}),
      exports: { 'react-native': './native.js', browser: './web.js', default: './web.js' },
    })
    for (const file of ['web.js', 'native.js'])
      writeFileSync(
        path.join(dir, file),
        `${imports};throw new Error('entry must not execute');export const value=${JSON.stringify(dir + file)}`,
      )
    if (participant) writeFileSync(path.join(dir, 'owner.json'), text)
  }
  const first = path.join(root, 'node_modules/fixture-widget')
  const bridge = path.join(root, 'node_modules/fixture-bridge')
  const second = path.join(bridge, 'node_modules/fixture-widget')
  pkg(first, 'fixture-widget')
  pkg(bridge, 'fixture-bridge', `export {value as nested} from 'fixture-widget'`, false)
  pkg(second, 'fixture-widget', `import 'fixture-bridge'`, true, '2.0.0')
  // Declared but never imported: a package-name walk would assess it wrongly.
  const unused = path.join(root, 'node_modules/fixture-unused')
  pkg(unused, 'fixture-unused')
  writeFileSync(path.join(unused, 'owner.json'), 'not valid JSON')
  json(path.join(root, 'package.json'), {
    type: 'module',
    dependencies: { 'fixture-unused': '1', 'fixture-widget': '1', 'fixture-bridge': '1' },
  })
  writeFileSync(
    path.join(root, 'entry.js'),
    `export {value} from 'fixture-widget';export {nested} from 'fixture-bridge';export const lazy=()=>import('./lazy.js')`,
  )
  writeFileSync(path.join(root, 'lazy.js'), `export {value} from 'fixture-widget'`)
  writeFileSync(path.join(root, 'tokens.css'), '@theme {--spacing:.25rem;} @tailwind utilities;')
  const locate = (id: string) => {
    if (!path.isAbsolute(id) || id.includes('?') || id.includes('\0')) return
    const entry = path.resolve(id)
    const owner = [...roots]
      .sort((a, b) => b.root.length - a.root.length)
      .find(({ root: base }) => {
        const rel = path.relative(base, entry)
        return rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel)
      })
    if (owner) {
      const metadata = JSON.parse(readFileSync(path.join(owner.root, 'package.json'), 'utf8'))
      return { packageRoot: owner.root, entry, declaredManifest: metadata.hozo?.manifest ?? null }
    }
  }
  return { root, first, second, unused, locate }
}
async function tinyBuild(root, platform, plugins: Plugin[]) {
  return build({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: [hozo({ root, css: 'tokens.css', content: { packages: [] } }), ...plugins],
    resolve: { conditions: platform === 'native' ? ['react-native'] : ['browser'] },
    build: {
      write: false,
      minify: false,
      lib: { entry: path.join(root, 'entry.js'), formats: ['es'] },
    },
  })
}

test('real Vite graph includes dynamic/transitive/cyclic imports and two instances, not unimported declarations', async (t) => {
  const f = fixture(t)
  for (const platform of ['web', 'native']) {
    const captures: OwnerManifestCapture[] = []
    let lease: OwnerManifestLease | undefined
    const probe = ownerManifestGraphProbe({
      platform,
      context: 'test-compiler-theme-abi-policy',
      locate: f.locate,
      observed(phase, capture) {
        captures.push(capture)
        if (phase === 'output') lease = probe.current().lease()
      },
    })
    const output = await tinyBuild(f.root, platform, [probe.plugin])
    assert.equal(captures.length, 2)
    assert.deepEqual(captures[0], captures[1])
    const captured = captures[0]!
    assert.equal(captured.status, 'complete')
    if (captured.status !== 'complete') continue
    assert.equal(captured.bindings.length, 6)
    const participants = captured.bindings.filter((binding) => binding.manifest)
    assert.deepEqual(
      new Set(participants.map((binding) => binding.instance)),
      new Set([f.first, f.second]),
    )
    assert.ok(
      participants.every((binding) =>
        binding.entry.endsWith(platform === 'native' ? 'native.js' : 'web.js'),
      ),
    )
    assert.ok(captured.bindings.every((binding) => binding.instance !== f.unused))
    assert.ok(
      participants.every((binding) => binding.manifest!.shadow.contracts[0]!.audit === 'unknown'),
    )
    assert.throws(() => lease!.check(), /INVALIDATED/, 'closeBundle retires the lease')
    assert.doesNotMatch(
      JSON.stringify(output),
      /owner-manifest-capture-0|test-compiler-theme-abi-policy/,
    )
  }
})

test('manifest replacement after graph freeze refuses output instead of accepting the old lease', async (t) => {
  const f = fixture(t)
  let graphLease: OwnerManifestLease | undefined
  const probe = ownerManifestGraphProbe({
    platform: 'web',
    context: 'test',
    locate: f.locate,
    observed() {},
  })
  // buildEnd observes before adoption; capture the lease in the next hook.
  const mutate: Plugin = {
    name: 'change-after-freeze',
    generateBundle() {
      graphLease = probe.current().lease()
      writeFileSync(path.join(f.second, 'owner.json'), `${text}\n`)
    },
  }
  await assert.rejects(tinyBuild(f.root, 'web', [probe.plugin, mutate]), /INVALIDATED/)
  assert.throws(() => graphLease!.check(), /INVALIDATED/)
})

test('virtual ownership and promised missing manifests are incomplete rather than ordinary nonparticipants', async (t) => {
  const f = fixture(t)
  for (const virtual of [false, true]) {
    if (virtual) writeFileSync(path.join(f.root, 'entry.js'), `export {value} from 'virtual:owner'`)
    else rmSync(path.join(f.second, 'owner.json'))
    let captured: OwnerManifestCapture | undefined
    const probe = ownerManifestGraphProbe({
      platform: 'web',
      context: 'test',
      locate: f.locate,
      observed(_phase, next) {
        captured = next
      },
    })
    const virtualPlugin: Plugin = {
      name: 'virtual-owner',
      resolveId(id) {
        if (id === 'virtual:owner') return '\0virtual:owner'
      },
      load(id) {
        if (id === '\0virtual:owner') return 'export const value=1'
      },
    }
    await assert.rejects(tinyBuild(f.root, 'web', [virtualPlugin, probe.plugin]), /INCOMPLETE/)
    assert.equal(captured?.status, 'incomplete')
    if (captured?.status === 'incomplete')
      assert.ok(
        captured.issues.some(
          (issue) => issue.kind === (virtual ? 'unresolved' : 'missing-manifest'),
        ),
      )
  }
})

test('graph receipts do not certify a later output failure as a successful build', async (t) => {
  const f = fixture(t)
  const phases: string[] = []
  const probe = ownerManifestGraphProbe({
    platform: 'web',
    context: 'test',
    locate: f.locate,
    observed(phase) {
      phases.push(phase)
    },
  })
  const fail: Plugin = {
    name: 'fail-after-graph-receipt',
    generateBundle: {
      order: 'post',
      handler() {
        throw new Error('late output failed')
      },
    },
  }
  await assert.rejects(tinyBuild(f.root, 'web', [probe.plugin, fail]), /late output failed/)
  assert.ok(phases.includes('graph'))
  assert.throws(() => probe.current().lease(), /INVALIDATED/)
})
