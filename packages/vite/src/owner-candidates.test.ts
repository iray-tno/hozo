import assert from 'node:assert/strict'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { build, type Plugin } from 'vite'
import { fixtureNode } from '../../metro/fixtures/fixture-process.mjs'
import {
  hozo,
  hozoWithDiscoveredOwnerCallers,
  hozoWithOwnerCallers,
  hozoWithOwnerCandidates,
} from './index.ts'
import { captureViteOwnerCandidates } from './owner-candidates.ts'
import { ViteOwnerPreflightUnavailable } from './owner-preflight.ts'
import { discoverViteOwnerSourcePlan } from './owner-source-plan.ts'

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

function callerFixture(t) {
  const f = fixture(t)
  const contract = JSON.parse(
    readFileSync(
      new URL('../../../scripts/style-slots/owner-shadow.json', import.meta.url),
      'utf8',
    ),
  )
  contract.contracts = contract.contracts.filter((row) => row.owner === 'BottomSheet.handle')
  const manifest = JSON.parse(readFileSync(path.join(f.first, 'owner.json'), 'utf8'))
  manifest.owners = contract
  manifest.exports = [{ name: 'Sheet', owners: ['BottomSheet.handle'] }]
  writeFileSync(path.join(f.first, 'owner.json'), JSON.stringify(manifest))
  writeFileSync(path.join(f.first, 'web.js'), 'export function Sheet(props){return props}')
  writeFileSync(
    f.entry,
    `import {View} from '@hozo/primitives';import {Sheet as Panel} from 'widget';
export const Row=()=> <View className="p-3"><Panel handleClassName="p-2" onClose={globalThis.close}/></View>`,
  )
  const plan = {
    ...f.plan,
    edges: [f.plan.edges[0]!],
    callers: [
      {
        importer: f.entry,
        specifier: 'widget',
        imported: 'Sheet',
        classProp: 'handleClassName',
      },
    ],
  }
  const run = (mode = 'callers', extra: Plugin[] = []) =>
    build({
      root: f.root,
      configFile: false,
      logLevel: 'silent',
      plugins: [
        mode === 'discovered' || mode === 'fallback'
          ? hozoWithDiscoveredOwnerCallers(
              f.options,
              mode === 'fallback' ? 'ordinary-fallback' : 'strict',
            )
          : mode === 'callers'
            ? hozoWithOwnerCallers(f.options, plan)
            : mode === 'candidates'
              ? hozoWithOwnerCandidates(f.options, plan)
              : hozo(f.options),
        ...extra,
      ],
      resolve: {
        conditions: ['browser'],
        ...((mode === 'discovered' || mode === 'fallback') && {
          alias: {
            '@hozo/primitives': fileURLToPath(
              new URL('../../primitives/dist/index.js', import.meta.url),
            ),
          },
        }),
      },
      build: {
        write: false,
        minify: false,
        lib: { entry: f.entry, formats: ['es'] },
        rolldownOptions: {
          external: (id) => id.startsWith('react/') || id.startsWith('@hozo/engine'),
        },
      },
    })
  return { ...f, plan, run }
}

test('Vite publishes captured caller code and companion CSS through the ordinary module pipeline', {
  timeout: 15000,
}, async (t) => {
  const f = callerFixture(t)
  const candidateOnly = JSON.stringify(await f.run('candidates'))
  assert.doesNotMatch(candidateOnly, /hozo-owner-[a-f0-9]{16}-r/)
  const output = JSON.stringify(await f.run())
  assert.match(output, /handleClassName[^\n]+hozo-owner-/)
  assert.match(output, /padding-top: ?14px/)
  assert.match(output, /padding-top: ?21px/)
  const companion = readFileSync(`${f.entry}.hozo.css`, 'utf8')
  assert.match(companion, /\.hozo-owner-/)
  assert.match(companion, /padding-top: 14px/)
  assert.match(companion, /padding-top: 21px/)
  assert.doesNotMatch(
    output,
    /OWNER_CONTRACT|explicit-instance-owner-preview|prepareInstanceOwnerCallers|TailwindProjectSession/,
  )
  assert.equal(f.inventory().status, 'complete')
  const ordinary = JSON.stringify(await f.run('ordinary'))
  assert.doesNotMatch(ordinary, /hozo-owner-[a-f0-9]{16}-r/)
  assert.doesNotMatch(readFileSync(`${f.entry}.hozo.css`, 'utf8'), /hozo-owner-/)
})

test('Vite retains opaque, unsupported and spread caller carriers and replaces stale prepared CSS', {
  timeout: 15000,
}, async (t) => {
  const f = callerFixture(t)
  const source = readFileSync(f.entry, 'utf8')
  await f.run()
  for (const carrier of [
    'handleClassName={globalThis.classes}',
    'handleClassName="p-2 unknown-owner"',
    '{...globalThis.props} handleClassName="p-2"',
  ]) {
    writeFileSync(f.entry, source.replace('handleClassName="p-2"', carrier))
    const output = JSON.stringify(await f.run())
    assert.doesNotMatch(output, /hozo-owner-[a-f0-9]{16}-r/)
    assert.doesNotMatch(readFileSync(`${f.entry}.hozo.css`, 'utf8'), /hozo-owner-/)
  }
})

test('caller output cannot cross capture retirement or missing entry identity', {
  timeout: 15000,
}, async (t) => {
  for (const kind of ['manifest', 'missing-edge']) {
    const f = callerFixture(t)
    if (kind === 'missing-edge') f.plan.callers[0]!.specifier = 'not-captured'
    const plugin: Plugin = {
      name: 'retire-owner',
      generateBundle() {
        const file = path.join(f.first, 'owner.json')
        writeFileSync(file, `${readFileSync(file, 'utf8')}\n`)
      },
    }
    await assert.rejects(
      f.run('callers', kind === 'manifest' ? [plugin] : []),
      /INVALIDATED|not captured/,
    )
    assert.equal(f.inventory().status, 'failed')
  }
})

test('caller plans cannot mutate after configuration and a new stylesheet build uses its own theme', {
  timeout: 15000,
}, async (t) => {
  const f = callerFixture(t)
  const plugins = hozoWithOwnerCallers(f.options, f.plan)
  f.plan.callers[0]!.imported = 'Mutated'
  // Exercise the actual configured plugin, not a newly snapshotted plan.
  await build({
    root: f.root,
    configFile: false,
    logLevel: 'silent',
    plugins,
    resolve: { conditions: ['browser'] },
    build: {
      write: false,
      minify: false,
      lib: { entry: f.entry, formats: ['es'] },
      rolldownOptions: {
        external: (id) => id.startsWith('react/') || id.startsWith('@hozo/engine'),
      },
    },
  })
  assert.match(readFileSync(`${f.entry}.hozo.css`, 'utf8'), /\.hozo-owner-/)
  f.plan.callers[0]!.imported = 'Sheet'
  writeFileSync(path.join(f.root, 'tokens.css'), '@theme {--spacing:9px;} @tailwind utilities;')
  await f.run()
  const css = readFileSync(`${f.entry}.hozo.css`, 'utf8')
  assert.match(css, /padding-top: 18px/)
  assert.match(css, /padding-top: 27px/)
  assert.doesNotMatch(css, /padding-top: 14px/)
  assert.throws(() => hozoWithOwnerCallers(f.options, { ...f.plan, callers: [] }), /budget/)
  assert.throws(
    () =>
      hozoWithOwnerCallers(f.options, {
        ...f.plan,
        callers: [f.plan.callers[0]!, f.plan.callers[0]!],
      }),
    /duplicate/,
  )
})

test('actual Vite-selected package instances no longer need a handwritten locate map', {
  timeout: 15000,
}, async (t) => {
  const f = fixture(t)
  delete f.plan.locate
  const output = JSON.stringify(await f.run())
  assert.match(output, /padding-top: ?14px/)
  assert.match(output, /padding-top: ?28px/)
  assert.deepEqual(new Set(f.inventory().packages.instances), new Set([f.first, f.second]))
  const caller = callerFixture(t)
  delete caller.plan.locate
  assert.match(JSON.stringify(await caller.run()), /handleClassName[^\n]+hozo-owner-[a-f0-9]{16}-r/)
})

test('captured manifests select real caller aliases without a handwritten class-prop binding list', {
  timeout: 15000,
}, async (t) => {
  const f = callerFixture(t)
  delete f.plan.locate
  delete f.plan.callers
  const input = readFileSync(f.entry, 'utf8')
  assert.match(JSON.stringify(await f.run()), /handleClassName[^\n]+hozo-owner-[a-f0-9]{16}-r/)
  const file = path.join(f.first, 'owner.json')
  const data = JSON.parse(readFileSync(file, 'utf8'))
  data.exports.push({ name: 'AliasSheet', owners: ['BottomSheet.handle'] })
  writeFileSync(file, JSON.stringify(data))
  writeFileSync(
    path.join(f.first, 'web.js'),
    'export function Sheet(props){return props};export {Sheet as AliasSheet}',
  )
  writeFileSync(f.entry, input.replace('Sheet as Panel', 'AliasSheet as Panel'))
  const output = JSON.stringify(await f.run())
  assert.match(output, /handleClassName[^\n]+hozo-owner-[a-f0-9]{16}-r/)
  assert.equal(f.inventory().status, 'complete')
  writeFileSync(
    f.entry,
    input.replace('handleClassName="p-2"', 'handleClassName={globalThis.classes}'),
  )
  assert.doesNotMatch(JSON.stringify(await f.run()), /hozo-owner-[a-f0-9]{16}-r/)
})

test('configured source imports drive actual Vite capture without edges, locators or caller lists', {
  timeout: 15000,
}, async (t) => {
  const f = callerFixture(t)
  const output = JSON.stringify(await f.run('discovered'))
  assert.match(output, /handleClassName[^\n]+hozo-owner-[a-f0-9]{16}-r/)
  assert.match(readFileSync(`${f.entry}.hozo.css`, 'utf8'), /padding-top: 14px/)
  assert.equal(f.inventory().status, 'complete')
  assert.equal(f.inventory().finalOrderingReady, false)
  assert.deepEqual(f.inventory().packages.instances, [f.first])
})

test('inspected zero-import sources build normally instead of pretending the snapshot is missing', {
  timeout: 15000,
}, async (t) => {
  const f = callerFixture(t)
  writeFileSync(f.entry, "import type {Missing} from 'not-installed';export const answer=42")
  assert.match(JSON.stringify(await f.run('discovered')), /42/)
  assert.equal(f.inventory().status, 'complete')
  assert.deepEqual(f.inventory().packages.instances, [])
  let resolutions = 0
  const session = await captureViteOwnerCandidates(
    discoverViteOwnerSourcePlan([f.entry]),
    async () => {
      resolutions++
      return null
    },
    'inspected-empty',
  )
  assert.equal(resolutions, 0)
  assert.deepEqual(session.lease.capture.bindings, [])
  assert.ok(session.watches(f.entry))
  assert.ok(session.watches(path.join(f.root, 'package.json')))
  writeFileSync(path.join(f.root, 'package.json'), '{"name":"changed"}')
  assert.throws(() => session.validate(), /boundary changed|metadata changed/)
  assert.throws(() => session.check(), /INVALIDATED/)
  await assert.rejects(
    captureViteOwnerCandidates(
      { edges: [], context: 'no-source-observation' },
      async () => null,
      'missing',
    ),
    /startup plan/,
  )
})

test('an empty inspected import set still rejects a late participating package graph', async (t) => {
  const f = callerFixture(t)
  writeFileSync(f.entry, 'export const answer=42')
  const session = await captureViteOwnerCandidates(
    discoverViteOwnerSourcePlan([f.entry]),
    async () => null,
    'late-after-empty',
  )
  assert.throws(
    () =>
      session.validateGraph({
        *getModuleIds() {
          yield f.entry
        },
        getModuleInfo() {
          return { importedIds: [path.join(f.first, 'web.js')], dynamicallyImportedIds: [] }
        },
      }),
    /late or derived participant/,
  )
  assert.throws(() => session.check(), /INVALIDATED/)
})

test('static traversal captures nested package instances and cycles before candidate publication', {
  timeout: 15000,
}, async (t) => {
  const f = callerFixture(t)
  writeFileSync(
    f.entry,
    "import {View} from '@hozo/primitives';export {nested} from 'bridge';export const Row=()=> <View className={globalThis.tone}/>",
  )
  const output = JSON.stringify(await f.run('discovered'))
  assert.match(output, /padding-top: ?14px/)
  assert.deepEqual(f.inventory().packages.instances, [f.second])
})

test('captured dependency callers use ordinary lowering without admitting unrelated node_modules sources', {
  timeout: 15000,
}, async (t) => {
  const f = callerFixture(t)
  const consumer = path.join(f.root, 'node_modules/consumer')
  mkdirSync(consumer)
  writeFileSync(
    path.join(consumer, 'package.json'),
    '{"name":"consumer","type":"module","exports":"./index.tsx"}',
  )
  const dependency = path.join(consumer, 'index.tsx')
  writeFileSync(dependency, readFileSync(f.entry, 'utf8'))
  const plain = path.join(consumer, 'plain.tsx')
  writeFileSync(plain, 'export const Plain=()=> <span className="p-9"/>')
  writeFileSync(dependency, `${readFileSync(dependency, 'utf8')};export {Plain} from './plain.tsx'`)
  writeFileSync(f.entry, "export {Row,Plain} from 'consumer'")
  const observed: { importer: string; disposition: string }[] = []
  const output = JSON.stringify(
    await f.run('discovered', [
      {
        name: 'observe-dependency-owner',
        generateBundle() {
          const id = [...this.getModuleIds()].find(
            (id) => !id.includes('?') && !id.includes('\0') && path.resolve(id) === dependency,
          )
          const metadata = this.getModuleInfo(id!).meta.hozoOwnerDelivery
          observed.push({
            importer: metadata.owners[0].identity.importer,
            disposition: metadata.owners[0].findings[0].disposition,
          })
        },
      },
    ]),
  )
  assert.match(output, /handleClassName[^\n]+hozo-owner-[a-f0-9]{16}-r/)
  assert.match(readFileSync(`${dependency}.hozo.css`, 'utf8'), /padding-top: 14px/)
  assert.equal(existsSync(`${plain}.hozo.css`), false)
  assert.match(output, /p-9/)
  assert.deepEqual(observed, [{ importer: dependency, disposition: 'prepared-literal' }])
  const inventory = f.inventory()
  assert.equal(inventory.status, 'complete', JSON.stringify(inventory.issues))
  assert.ok(inventory.modules.some((id) => path.resolve(id) === dependency))
  assert.ok(!inventory.modules.some((id) => path.resolve(id) === plain))
  assert.ok(inventory.candidates.includes('p-2'))
  writeFileSync(
    dependency,
    readFileSync(dependency, 'utf8').replace(
      'handleClassName="p-2"',
      'handleClassName={globalThis.classes}',
    ),
  )
  assert.doesNotMatch(JSON.stringify(await f.run('discovered')), /hozo-owner-[a-f0-9]{16}-r/)
  assert.doesNotMatch(readFileSync(`${dependency}.hozo.css`, 'utf8'), /\.hozo-owner-/)
})

test('static capture snapshots dependency bytes and distinguishes actual external boundaries', async (t) => {
  const f = fixture(t)
  writeFileSync(f.entry, "export {nested} from 'bridge';import 'peer'")
  let resolutions = 0
  const resolve = async ({ importer, specifier }) => {
    resolutions++
    return specifier === 'peer'
      ? { id: 'peer', external: true }
      : {
          id: path.join(
            specifier === 'bridge' ? f.bridge : importer.startsWith(f.bridge) ? f.second : f.first,
            'web.js',
          ),
        }
  }
  const session = await captureViteOwnerCandidates(
    discoverViteOwnerSourcePlan([f.entry]),
    resolve,
    'transitive',
  )
  assert.equal(resolutions, 4)
  assert.deepEqual(
    session.contributions.instances.map((item) => item.instance),
    [f.second],
  )
  assert.deepEqual(
    new Set(session.sourceFiles),
    new Set([f.entry, path.join(f.bridge, 'web.js'), path.join(f.second, 'web.js')]),
  )
  assert.equal(
    session.lease.capture.bindings.some((edge) => edge.specifier === 'peer'),
    false,
  )
  assert.deepEqual(session.unassessedImports, [
    { importer: f.entry, specifier: 'peer', reason: 'external', entry: 'peer' },
  ])
  const dependency = path.join(f.bridge, 'web.js')
  assert.ok(session.watches(dependency))
  const before = session.lease.capture.fingerprint
  writeFileSync(dependency, `${readFileSync(dependency, 'utf8')}\n// changed but same imports`)
  assert.throws(() => session.validate(), /source snapshot changed/)
  assert.throws(() => session.check(), /INVALIDATED/)
  const after = await captureViteOwnerCandidates(
    discoverViteOwnerSourcePlan([f.entry]),
    resolve,
    'transitive',
  )
  assert.notEqual(after.lease.capture.fingerprint, before)
})

test('dependency source edits during later resolution cannot enter a mixed frozen graph', async (t) => {
  const f = fixture(t)
  writeFileSync(f.entry, "export {nested} from 'bridge'")
  await assert.rejects(
    captureViteOwnerCandidates(
      discoverViteOwnerSourcePlan([f.entry]),
      async ({ specifier }) => {
        if (specifier === 'widget')
          writeFileSync(path.join(f.bridge, 'web.js'), 'export const nested=7')
        return { id: path.join(specifier === 'bridge' ? f.bridge : f.second, 'web.js') }
      },
      'mixed-dependency',
    ),
    /source snapshot changed/,
  )
})

test('resolver slash spellings keep dependency importer identities native and deduplicated', async (t) => {
  const f = fixture(t)
  writeFileSync(f.entry, "export {nested} from 'bridge'")
  const session = await captureViteOwnerCandidates(
    discoverViteOwnerSourcePlan([f.entry]),
    async ({ specifier }) => ({
      id: path.join(specifier === 'bridge' ? f.bridge : f.second, 'web.js').replaceAll('\\', '/'),
    }),
    'resolver-spelling',
  )
  assert.equal(session.sourceFiles.length, 3)
  assert.ok(
    session.lease.capture.bindings.some(
      (edge) => edge.importer === path.join(f.bridge, 'web.js') && edge.specifier === 'widget',
    ),
  )
})

test('same-byte source directory retargeting cannot overwrite the original importer identity', async (t) => {
  const f = fixture(t)
  const link = path.join(f.root, 'linked-source')
  const source = "import 'one';import 'two';"
  for (const dir of [f.first, f.second]) writeFileSync(path.join(dir, 'Source.tsx'), source)
  const leaf = path.join(f.root, 'leaf.js')
  writeFileSync(leaf, 'export const value=1')
  symlinkSync(f.first, link, process.platform === 'win32' ? 'junction' : 'dir')
  const entry = path.join(link, 'Source.tsx')
  let resolutions = 0
  await assert.rejects(
    captureViteOwnerCandidates(
      discoverViteOwnerSourcePlan([entry]),
      async () => {
        resolutions++
        if (resolutions === 1) {
          unlinkSync(link)
          symlinkSync(f.second, link, process.platform === 'win32' ? 'junction' : 'dir')
        }
        return { id: leaf }
      },
      'same-byte-origin-retarget',
    ),
    /source ownership changed during capture/,
  )
  assert.equal(resolutions, 1)
})

test('static traversal refuses missing, non-JS, malformed and over-budget dependency sources', async (t) => {
  for (const kind of ['missing', 'non-js', 'syntax', 'budget']) {
    const f = fixture(t)
    writeFileSync(f.entry, "import 'dependency'")
    const file = path.join(f.root, kind === 'non-js' ? 'dependency.vue' : 'dependency.js')
    writeFileSync(
      file,
      kind === 'syntax'
        ? 'export const ='
        : kind === 'budget'
          ? Array.from({ length: 513 }, (_, index) => `import 'edge-${index}';`).join('\n')
          : 'export const n=1',
    )
    await assert.rejects(
      captureViteOwnerCandidates(
        discoverViteOwnerSourcePlan([f.entry]),
        async () => (kind === 'missing' ? null : { id: file }),
        kind,
      ),
      /unavailable|non-JS|SOURCE_UNASSESSED|REQUEST_BUDGET/,
    )
  }
})

test('ordinary CSS and JSON imports keep their Vite behavior beside captured owner callers', {
  timeout: 15000,
}, async (t) => {
  const f = callerFixture(t)
  writeFileSync(path.join(f.root, 'authored.css'), '.authored-boundary { color: rgb(1, 2, 3) }')
  writeFileSync(path.join(f.root, 'data.json'), '{"answer":42}')
  writeFileSync(
    f.entry,
    `import './authored.css';import data from './data.json';export {data};${readFileSync(f.entry, 'utf8')}`,
  )
  const output = JSON.stringify(await f.run('discovered'))
  assert.match(output, /authored-boundary/)
  assert.match(output, /answer[^\n]+42/)
  assert.match(output, /hozo-owner-[a-f0-9]{16}-r/)
  assert.equal(f.inventory().status, 'complete')
})

test('non-JS text imports are watched hashed boundaries, not captured JS bindings', async (t) => {
  const f = fixture(t)
  const css = path.join(f.root, 'tokens.css'),
    json = path.join(f.root, 'data.json')
  writeFileSync(f.entry, "import './tokens.css';import data from './data.json';export {data}")
  writeFileSync(json, '{"answer":42}')
  const session = await captureViteOwnerCandidates(
    discoverViteOwnerSourcePlan([f.entry]),
    async ({ specifier }) => ({ id: path.resolve(f.root, specifier) }),
    'text-imports',
  )
  assert.deepEqual(session.lease.capture.bindings, [])
  assert.deepEqual(
    new Set(session.unassessedImports.map((edge) => edge.entry)),
    new Set([css, json]),
  )
  for (const edge of session.unassessedImports) {
    assert.equal(edge.reason, 'non-js-source')
    assert.match(edge.sha256!, /^[a-f0-9]{64}$/)
    assert.ok(session.watches(edge.entry))
    assert.equal(session.sourceImports(edge.entry), undefined)
  }
  writeFileSync(json, '{"answer":43}')
  assert.throws(() => session.validate(), /source snapshot changed/)
  assert.throws(() => session.check(), /INVALIDATED/)
})

test('expected preflight scope refusal is typed but cannot hide source or manifest races', async (t) => {
  for (const kind of ['unresolved', 'virtual', 'source-race', 'manifest-race']) {
    const f = fixture(t)
    writeFileSync(f.entry, "import 'one';import 'two'")
    let calls = 0
    await assert.rejects(
      captureViteOwnerCandidates(
        discoverViteOwnerSourcePlan([f.entry]),
        async () => {
          calls++
          if (calls === 1) return { id: path.join(f.first, 'web.js') }
          if (kind === 'source-race') writeFileSync(f.entry, "import 'one';import 'two';// edited")
          if (kind === 'manifest-race') {
            const file = path.join(f.first, 'owner.json')
            writeFileSync(file, `${readFileSync(file, 'utf8')}\n`)
          }
          return kind === 'virtual' ? { id: '\0generated-module' } : null
        },
        kind,
      ),
      (error) => {
        assert.ok(error instanceof Error)
        if (kind === 'unresolved' || kind === 'virtual') {
          assert.ok(error instanceof ViteOwnerPreflightUnavailable)
          assert.equal(
            error.reason,
            kind === 'unresolved' ? 'unresolved-import' : 'unsupported-module',
          )
        } else {
          assert.equal(error instanceof ViteOwnerPreflightUnavailable, false)
          assert.match(error.message, /source snapshot changed|manifest observation changed/)
        }
        return true
      },
    )
  }
})

test('ordinary fallback is chosen before output, preserving ordinary code and CSS without owner namespaces', {
  timeout: 15000,
}, async (t) => {
  const f = callerFixture(t)
  writeFileSync(
    f.entry,
    `import text from './token.txt?raw';export {text};${readFileSync(f.entry, 'utf8')}`,
  )
  writeFileSync(path.join(f.root, 'token.txt'), 'ordinary-text-asset')
  let route: unknown
  const capture: Plugin = {
    name: 'observe-fallback',
    generateBundle() {
      const id = [...this.getModuleIds()].find(
        (id) => !id.includes('?') && !id.includes('\0') && path.resolve(id) === f.entry,
      )
      route = this.getModuleInfo(id!).meta.hozoOwnerAdmission
    },
  }
  const built = await f.run('fallback', [capture])
  const output = JSON.stringify(built)
  assert.match(output, /ordinary-text-asset/)
  assert.match(output, /padding-top: ?21px/)
  assert.doesNotMatch(output, /hozo-owner-[a-f0-9]{16}-r/)
  assert.doesNotMatch(readFileSync(`${f.entry}.hozo.css`, 'utf8'), /hozo-owner-[a-f0-9]{16}-r/)
  assert.deepEqual(route, { schema: 1, route: 'ordinary-fallback', reason: 'unsupported-module' })
  assert.equal('packages' in f.inventory(), false)
  const assets = (result) =>
    (Array.isArray(result) ? result : [result])
      .flatMap((item) => item.output)
      .map((item) => ({
        file: item.fileName,
        content: item.type === 'chunk' ? item.code : String(item.source),
      }))
      .sort((a, b) => a.file.localeCompare(b.file))
  assert.deepEqual(assets(built), assets(await f.run('ordinary')))
  await assert.rejects(f.run('discovered'), /entry ownership unavailable/)
})

test('ordinary fallback cannot swallow arbitrary resolver errors or source invalidation', {
  timeout: 15000,
}, async (t) => {
  for (const kind of ['resolver', 'source']) {
    const f = callerFixture(t)
    let hit = false
    await assert.rejects(
      f.run('fallback', [
        {
          name: 'fail-preflight',
          enforce: 'pre',
          resolveId(id) {
            if (id === 'widget' && !hit) {
              hit = true
              if (kind === 'resolver') throw new Error('independent resolver defect')
              writeFileSync(f.entry, `${readFileSync(f.entry, 'utf8')}\n// changed`)
              return '\0late-virtual'
            }
          },
        },
      ]),
      kind === 'resolver' ? /independent resolver defect/ : /source snapshot changed/,
    )
    assert.equal(hit, true)
    assert.equal(f.inventory().status, 'failed')
  }
})

test('authored source mutation during resolution cannot adopt a mixed owner snapshot', {
  timeout: 15000,
}, async (t) => {
  const f = callerFixture(t)
  let changed = false
  await assert.rejects(
    f.run('discovered', [
      {
        name: 'change-observed-source',
        enforce: 'pre',
        resolveId(id) {
          if (id === 'widget' && !changed) {
            changed = true
            writeFileSync(f.entry, readFileSync(f.entry, 'utf8').replace('p-2', 'p-4'))
          }
        },
      },
    ]),
    /source snapshot changed/,
  )
  assert.equal(changed, true)
  assert.equal(f.inventory().status, 'failed')
})

test('a new configured source after capture refuses final output instead of extending the frozen owner set', {
  timeout: 15000,
}, async (t) => {
  const f = callerFixture(t)
  f.options.content.include = ['*.tsx']
  await assert.rejects(
    f.run('discovered', [
      {
        name: 'add-observed-source',
        generateBundle() {
          writeFileSync(path.join(f.root, 'Late.tsx'), 'export const Late=()=>null')
        },
      },
    ]),
    /source set changed/,
  )
  assert.equal(f.inventory().status, 'failed')
})

test('absent physical package boundaries are watched and creation retires an existing lease', {
  timeout: 15000,
}, async (t) => {
  const f = fixture(t)
  const importer = path.join(f.root, 'src/App.tsx')
  mkdirSync(path.dirname(importer))
  writeFileSync(importer, "import {value} from 'widget'")
  const session = await captureViteOwnerCandidates(
    { context: 'physical', edges: [{ importer, specifier: 'widget' }] },
    async () => ({ id: path.join(f.first, 'web.js') }),
    'epoch',
  )
  const nested = path.join(f.root, 'src/package.json')
  assert.equal(session.watches(nested), true)
  assert.ok(session.watchFiles.includes(nested))
  for (let i = 0; i < 100; i++) session.check()
  writeFileSync(nested, '{}')
  assert.throws(() => session.validate(), /package boundary changed/)
  assert.throws(() => session.check(), /INVALIDATED/)
})

test('a new nested package cannot make captured owner output appear ordinary at final publication', {
  timeout: 15000,
}, async (t) => {
  const f = callerFixture(t)
  delete f.plan.locate
  const metadata = JSON.parse(readFileSync(path.join(f.first, 'package.json'), 'utf8'))
  mkdirSync(path.join(f.first, 'dist'))
  cpSync(path.join(f.first, 'web.js'), path.join(f.first, 'dist/web.js'))
  metadata.exports['.'].browser = './dist/web.js'
  writeFileSync(path.join(f.first, 'package.json'), JSON.stringify(metadata))
  await assert.rejects(
    f.run('callers', [
      {
        name: 'new-package-boundary',
        generateBundle() {
          writeFileSync(path.join(f.first, 'dist/package.json'), '{}')
        },
      },
    ]),
    /package boundary changed/,
  )
  assert.equal(f.inventory().status, 'failed')
})

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
