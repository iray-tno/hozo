import assert from 'node:assert/strict'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { build, type Plugin } from 'vite'
import { fixtureNode } from '../../metro/fixtures/fixture-process.mjs'
import { hozo, hozoWithOwnerCandidates } from './index.ts'
import { captureViteOwnerCandidates } from './owner-candidates.ts'

function fixture(t) {
  const root = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'hozo-owner-css-')))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const first = path.join(root, 'node_modules/widget'),
    bridge = path.join(root, 'node_modules/bridge'),
    second = path.join(bridge, 'node_modules/widget')
  const roots = [root, first, bridge, second]
  const json = (file, data) => writeFileSync(file, JSON.stringify(data))
  for (const [index, dir] of roots.entries()) {
    mkdirSync(dir, { recursive: true })
    json(path.join(dir, 'package.json'), {
      name: index === 1 || index === 3 ? 'widget' : index === 0 ? 'app' : 'bridge',
      type: 'module',
      version: index === 3 ? '2.0.0' : '1.0.0',
      exports: { '.': { browser: './web.js', default: './native.js' } },
      ...(index === 1 || index === 3 ? { hozo: { manifest: 'owner.json' } } : {}),
    })
    if (index) {
      for (const file of ['web.js', 'native.js'])
        writeFileSync(
          path.join(dir, file),
          `${index === 2 ? "export {value as nested} from 'widget';" : index === 3 ? "import 'bridge';" : ''}export const value=1;throw new Error('entries must not execute during compilation')`,
        )
    }
    if (index === 1 || index === 3)
      json(path.join(dir, 'owner.json'), {
        schema: 'rfc010-package-shadow-0',
        owners: null,
        exports: [{ name: 'value', owners: [] }],
        helpers: [],
        candidates: [index === 1 ? 'p-4' : 'p-2'],
        compiledByConsumer: true,
        textForwarding: { version: 1, textForwarding: {} },
      })
  }
  const entry = path.join(root, 'entry.tsx')
  writeFileSync(
    entry,
    `import {View} from '@hozo/core';import {value} from 'widget';import {nested} from 'bridge';export {value,nested};export const Row=()=> <View className={globalThis.tone}/>`,
  )
  writeFileSync(path.join(root, 'tokens.css'), '@theme {--spacing:7px;} @tailwind utilities;')
  const locate = (id: string) => {
    if (!path.isAbsolute(id) || id.includes('?') || id.includes('\0')) return
    const entry = path.resolve(id)
    const dir = [...roots]
      .sort((a, b) => b.length - a.length)
      .find((candidate) => {
        const rel = path.relative(candidate, entry)
        return (
          rel !== '..' &&
          !rel.startsWith(`..${path.sep}`) &&
          !path.isAbsolute(rel) &&
          !rel.split(path.sep).includes('node_modules')
        )
      })
    if (dir)
      return {
        packageRoot: dir,
        entry,
        declaredManifest:
          JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')).hozo?.manifest ?? null,
      }
  }
  const plan = {
    context: 'fixture',
    locate,
    edges: [
      { importer: entry, specifier: 'widget' },
      { importer: entry, specifier: 'bridge' },
      { importer: path.join(bridge, 'web.js'), specifier: 'widget' },
      { importer: path.join(second, 'web.js'), specifier: 'bridge' },
    ],
  }
  const options = { root, css: 'tokens.css', content: { include: ['entry.tsx'], packages: [] } }
  const run = (consumer = true, extra: Plugin[] = []) =>
    build({
      root,
      configFile: false,
      logLevel: 'silent',
      plugins: [consumer ? hozoWithOwnerCandidates(options, plan) : hozo(options), ...extra],
      resolve: { conditions: ['browser'] },
      build: {
        write: false,
        minify: false,
        lib: { entry, formats: ['es'], cssFileName: 'fixture' },
        rolldownOptions: {
          external: (id) => id.startsWith('react/') || id.startsWith('@hozo/engine'),
        },
      },
    })
  const inventory = () =>
    JSON.parse(
      readFileSync(path.join(root, 'node_modules/.hozo/candidate-inventory-client.json'), 'utf8'),
    )
  return { root, first, second, bridge, roots, entry, plan, options, run, inventory }
}

test('actual Vite resolver installs two package instances in emitted CSS and final inventory', {
  timeout: 15000,
}, async (t) => {
  const f = fixture(t)
  await f.run(false)
  assert.doesNotMatch(
    readFileSync(path.join(f.root, 'node_modules/.hozo/candidates.css'), 'utf8'),
    /padding-top/,
  )
  const output = await f.run()
  const css = JSON.stringify(output)
  assert.match(css, /padding-top: ?14px/)
  assert.match(css, /padding-top: ?28px/)
  const report = f.inventory()
  assert.equal(report.status, 'complete')
  assert.equal(report.scope, 'runtime-source-and-package-facts')
  assert.deepEqual(report.candidates, ['p-2', 'p-4'])
  assert.deepEqual(new Set(report.packages.instances), new Set([f.first, f.second]))
  assert.equal(report.authored.length, 1)
  assert.equal(report.finalOrderingReady, false)
  assert.doesNotMatch(css, /owner-package-candidates|runtime-source-and-package-facts/)
  await f.run(false)
  assert.equal(f.inventory().scope, 'runtime-source-facts')
  assert.deepEqual(f.inventory().candidates, [])
})

test('manifest or metadata changes after graph freeze refuse output and retire the inventory', {
  timeout: 15000,
}, async (t) => {
  for (const kind of ['manifest', 'metadata']) {
    const f = fixture(t)
    await assert.rejects(
      f.run(true, [
        {
          name: 'mutate-owner',
          generateBundle() {
            const file = path.join(f.first, kind === 'manifest' ? 'owner.json' : 'package.json')
            writeFileSync(file, `${readFileSync(file, 'utf8')}\n`)
          },
        },
      ]),
      /INVALIDATED|metadata changed/,
    )
    assert.equal(f.inventory().status, 'failed')
    assert.equal('candidates' in f.inventory(), false)
  }
})

test('a participant missing from the finite startup plan cannot silently extend the CSS namespace', {
  timeout: 15000,
}, async (t) => {
  const f = fixture(t)
  f.plan.edges = f.plan.edges.slice(0, 2)
  await assert.rejects(f.run(), /late or derived participant/)
  assert.equal(f.inventory().status, 'failed')
})

test('missing manifests fail before CSS publication and ownership callbacks cannot retarget resolved files', {
  timeout: 15000,
}, async (t) => {
  const f = fixture(t)
  rmSync(path.join(f.second, 'owner.json'))
  await assert.rejects(f.run(), /INCOMPLETE/)
  assert.equal(existsSync(path.join(f.root, 'node_modules/.hozo/candidates.css')), false)
  await assert.rejects(
    captureViteOwnerCandidates(
      {
        ...f.plan,
        edges: [f.plan.edges[0]!],
        locate(id) {
          const owner = f.plan.locate(id)
          return owner && id === path.join(f.first, 'native.js')
            ? { ...owner, entry: path.join(f.first, 'web.js') }
            : owner
        },
      },
      async () => ({ id: path.join(f.first, 'native.js') }),
      'context',
    ),
    /entry ownership unavailable/,
  )
})

test('warm owner leases do no filesystem polling and watcher retirement fences pending delivery', {
  timeout: 15000,
}, async (t) => {
  const f = fixture(t)
  let lookups = 0
  const plan = {
    ...f.plan,
    edges: [f.plan.edges[0]!],
    locate(id) {
      lookups++
      return f.plan.locate(id)
    },
  }
  const session = await captureViteOwnerCandidates(
    plan,
    async () => ({ id: path.join(f.first, 'web.js') }),
    'warm',
  )
  const baseline = lookups
  for (let i = 0; i < 100; i++) session.check()
  assert.equal(lookups, baseline)
  assert.ok(session.watches(path.join(f.first, 'owner.json').replaceAll('\\', '/')))
  let release = () => {}
  const wait = new Promise<void>((resolve) => {
    release = resolve
  })
  const pending = (async () => {
    await wait
    session.check()
    return 'stale output'
  })()
  session.invalidate()
  release()
  await assert.rejects(pending, /INVALIDATED/)
  assert.throws(() => session.validate(), /INVALIDATED/)
})

test('the same packed non-Hozo fixture used by Native supplies manifest-only Web CSS', {
  timeout: 30000,
}, async (t) => {
  const f = fixture(t)
  const stage = path.join(f.root, 'packing')
  cpSync(new URL('../../metro/fixtures/owner-candidate-package/', import.meta.url), stage, {
    recursive: true,
  })
  const nodeDirectory = path.dirname(process.execPath)
  const npm = [
    path.join(nodeDirectory, 'node_modules/npm/bin/npm-cli.js'),
    path.join(nodeDirectory, '../lib/node_modules/npm/bin/npm-cli.js'),
  ].find(existsSync)
  assert.ok(npm, 'the pinned Node distribution must provide its npm CLI')
  const packed = JSON.parse(
    (
      await fixtureNode(
        [
          npm,
          'pack',
          '--ignore-scripts',
          '--offline',
          '--json',
          '--cache',
          './npm-cache',
          '--loglevel=verbose',
        ],
        stage,
        { signal: t.signal },
      )
    ).stdout,
  )[0]
  assert.equal(packed.filename, 'acme-frozen-styles-1.0.0.tgz')
  assert.equal(packed.files.length, 6)
  await fixtureNode(
    [
      npm,
      'install',
      '--ignore-scripts',
      '--offline',
      '--no-audit',
      '--no-fund',
      '--package-lock=false',
      '--cache',
      './npm-cache',
      './packing/acme-frozen-styles-1.0.0.tgz',
    ],
    f.root,
    { signal: t.signal },
  )
  const installed = path.join(f.root, 'node_modules/acme-frozen-styles')
  f.roots.push(installed)
  assert.equal(existsSync(path.join(installed, 'not-packed.js')), false)
  f.plan.edges = [{ importer: f.entry, specifier: 'acme-frozen-styles' }]
  writeFileSync(
    f.entry,
    `import {View} from '@hozo/core';import {token} from 'acme-frozen-styles';export const Row=()=> <View className={token}/>`,
  )
  await f.run(false)
  assert.doesNotMatch(
    readFileSync(path.join(f.root, 'node_modules/.hozo/candidates.css'), 'utf8'),
    /padding-top/,
  )
  const output = await f.run()
  const css = JSON.stringify(output)
  assert.match(css, /padding-top: ?21px/)
  assert.match(css, /padding-top: ?35px/)
  assert.doesNotMatch(css, /p-96/)
  assert.doesNotMatch(css, /owner-package-candidates|runtime-source-and-package-facts/)
  const report = f.inventory()
  assert.equal(report.status, 'complete')
  assert.deepEqual(report.candidates, ['p-3', 'p-5'])
  assert.deepEqual(report.packages.instances, [installed])
  assert.equal(report.authored.length, 1)
  assert.equal(report.finalOrderingReady, false)
})
