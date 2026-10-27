import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createCompiler, openCandidateCache } from '@hozo/compiler'
import { prepareLowerModuleStyles } from '@hozo/compiler/lower'
import { prepareTailwindOrder, tailwindPackageDir } from '@hozo/tailwind'
import { build, type Plugin } from 'vite'
import { candidateMetaKey, ViteCandidateInventory } from './candidate-inventory.ts'
import { ViteFinalStyleGraph } from './final-style-graph.ts'
import { hozo } from './index.ts'

const source = (classes = 'p-4 p-2') =>
  `import {View} from '@hozo/core';export const App=()=> <View className="${classes}"/>`
const css = '@theme {--spacing:.25rem;} @tailwind utilities;'
const prepare = async (names: readonly string[]) =>
  JSON.stringify((await prepareTailwindOrder(css, tailwindPackageDir(), names)).snapshot)

function observation(inventory: ViteCandidateInventory, id: string, input: string) {
  const cache = openCandidateCache()
  cache.scanFile(id, input, 0)
  const module = {
    id,
    code: input,
    meta: inventory.transformMeta(id, input, cache.exportFile(id)!),
  }
  inventory.moduleParsed(module)
  return module
}
function retained(id: string, input: string) {
  const continuation = prepareLowerModuleStyles(input, id, id, createCompiler(), process.cwd())
  const owner = continuation.module
  let disposals = 0,
    emissions = 0
  continuation.module = {
    candidates: owner.candidates,
    emit(context) {
      emissions++
      return owner.emit(context)
    },
    dispose() {
      disposals++
      owner.dispose()
    },
  }
  return {
    continuation,
    get disposals() {
      return disposals
    },
    get emissions() {
      return emissions
    },
  }
}

test('final graph owns current live IR, disposes superseded/absent modules and replays facts without rescanning', async (t) => {
  const inventory = new ViteCandidateInventory('client')
  const graph = new ViteFinalStyleGraph('client')
  const id = path.join(process.cwd(), 'Final.tsx')
  const old = retained(id, source('p-2'))
  graph.observe(id, source('p-2'), old.continuation)
  const live = retained(id, source())
  graph.observe(id, source(), live.continuation)
  assert.equal(old.disposals, 1)
  const absent = retained(`${id}?removed`, source('m-4'))
  graph.observe(`${id}?removed`, source('m-4'), absent.continuation)
  const module = observation(inventory, id, source())
  const runtime = inventory.publicationInputs([], [module])
  const prototype = Object.getPrototypeOf(openCandidateCache())
  t.mock.method(prototype, 'scanFile', () => {
    throw new Error('no final source scan')
  })
  t.mock.method(prototype, 'persist', () => {
    throw new Error('no shared cache writes')
  })
  let preparations = 0
  const result = await graph.publish(
    [module],
    runtime,
    async (names) => {
      preparations++
      assert.equal(absent.disposals, 1, 'release absent IR before asynchronous preparation')
      assert.deepEqual(names, ['p-2', 'p-4'])
      return prepare(names)
    },
    undefined,
    () => true,
  )
  assert.equal(result.status, 'complete')
  assert.equal(preparations, 1)
  assert.equal(result.fingerprint, result.nativePlanFingerprint)
  assert.equal(result.finalOrderingReady, false)
  assert.equal(result.bundleOutputPolicy, 'passthrough')
  assert.match(result.styles[0].css, /padding-top: 16px/)
  assert.equal(live.emissions, 1)
  assert.equal(live.disposals, 1)
  assert.equal(absent.emissions, 0)
  assert.equal(result.ignoredModules.length, 1)
})

test('cached metadata is not a live continuation; wrong revisions/environments and missing proofs publish no styles', async () => {
  const id = path.join(process.cwd(), 'Final.tsx')
  for (const mode of ['cached', 'stale', 'environment', 'proof']) {
    const inventory = new ViteCandidateInventory('client')
    const graph = new ViteFinalStyleGraph(mode === 'environment' ? 'ssr' : 'client')
    const module = observation(inventory, id, source())
    const live = retained(id, source())
    if (mode === 'cached') live.continuation.module.dispose()
    else graph.observe(id, mode === 'stale' ? source('p-2') : source(), live.continuation)
    if (mode === 'proof') delete module.meta[candidateMetaKey]
    const result = await graph.publish(
      [module],
      inventory.publicationInputs([], [module]),
      async () => {
        throw new Error('incomplete graph must not prepare')
      },
      undefined,
      () => true,
    )
    assert.equal(result.status, 'incomplete', mode)
    assert.equal('styles' in result, false)
    assert.equal('fingerprint' in result, false)
    assert.equal(live.emissions, 0)
    assert.equal(live.disposals, 1)
  }
})

test('changed stylesheet epochs and retired asynchronous publications cannot deliver final styles', async () => {
  for (const mode of ['changed', 'retired']) {
    const id = path.join(process.cwd(), 'Final.tsx')
    const inventory = new ViteCandidateInventory('client')
    const graph = new ViteFinalStyleGraph('client')
    const live = retained(id, source())
    const module = observation(inventory, id, source())
    graph.observe(id, source(), live.continuation)
    let current = true
    const gate = Promise.withResolvers<string>()
    const pending = graph.publish(
      [module],
      inventory.publicationInputs([], [module]),
      () => gate.promise,
      undefined,
      () => current,
    )
    if (mode === 'changed') current = false
    else graph.dispose()
    const rejected = assert.rejects(pending, /epoch changed|retired/)
    gate.resolve(await prepare(['p-2', 'p-4']))
    await rejected
    assert.equal(live.disposals, 1)
    assert.equal(live.emissions, 0)
  }
})

function fixture(t) {
  const root = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'hozo-final-style-')))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  writeFileSync(path.join(root, 'entry.tsx'), source())
  writeFileSync(path.join(root, 'tokens.css'), css)
  writeFileSync(path.join(root, 'post.mdx'), '# physical markdown is not a candidate source')
  const transformed: Plugin = {
    name: 'produce-mdx',
    enforce: 'pre',
    transform(_code, id) {
      if (id.split('?')[0]!.endsWith('post.mdx')) return source('w-8 w-4')
    },
  }
  return { root, transformed }
}
const readFinal = (root: string) =>
  JSON.parse(readFileSync(path.join(root, 'node_modules/.hozo/final-styles-client.json'), 'utf8'))
async function tinyBuild(root: string, transformed: Plugin, extra: Plugin[] = []) {
  return build({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: [hozo({ root, css: 'tokens.css' }), transformed, ...extra],
    build: {
      write: false,
      lib: { entry: path.join(root, 'entry.tsx'), formats: ['es'], cssFileName: 'fixture' },
      rolldownOptions: { external: ['react/jsx-runtime'] },
    },
  })
}

test('real Vite production graph finalizes actual static IR after OXC without activating provisional CSS assets', async (t) => {
  const { root, transformed } = fixture(t)
  const output = await tinyBuild(root, transformed)
  const final = readFinal(root)
  assert.equal(final.status, 'complete')
  assert.equal(final.staticOrderingReady, true)
  assert.equal(final.finalOrderingReady, false)
  assert.equal(final.bundleOutputPolicy, 'passthrough')
  assert.equal(final.styles.length, 1)
  assert.match(final.styles[0].css, /padding-top: 16px/)
  assert.match(readFileSync(path.join(root, 'entry.tsx.hozo.css'), 'utf8'), /padding-top: 8px/)
  assert.match(JSON.stringify(output), /padding(?:-top)?:8px/)
  assert.doesNotMatch(
    JSON.stringify(output),
    /scalar-order-v1:|static-final-styles|nativePlanFingerprint/,
  )
})

test('real transformed/query modules join the final namespace, and deleted modules disappear on the next build', async (t) => {
  const { root, transformed } = fixture(t)
  writeFileSync(
    path.join(root, 'entry.tsx'),
    `import {App as Other} from './post.mdx?variant';${source()};globalThis.other=Other`,
  )
  await tinyBuild(root, transformed)
  const first = readFinal(root)
  assert.equal(first.status, 'complete')
  assert.equal(first.styles.length, 2)
  assert.ok(
    first.styles.some(({ id, css }) => id.includes('?variant') && css.includes('width: 32px')),
  )
  assert.ok(first.candidates.includes('w-8'))
  writeFileSync(path.join(root, 'entry.tsx'), source('p-2'))
  await tinyBuild(root, transformed)
  const second = readFinal(root)
  assert.equal(second.status, 'complete')
  assert.equal(second.styles.length, 1)
  assert.equal(second.candidates.includes('w-8'), false)
})

test('incomplete/failed real builds replace prior complete final-style evidence without reusing its styles', async (t) => {
  const { root, transformed } = fixture(t)
  await tinyBuild(root, transformed)
  assert.equal(readFinal(root).status, 'complete')
  await tinyBuild(root, transformed, [
    {
      name: 'lose-proof',
      moduleParsed(module) {
        if (module.id.endsWith('entry.tsx')) delete module.meta[candidateMetaKey]
      },
    },
  ])
  assert.equal(readFinal(root).status, 'incomplete')
  assert.equal('styles' in readFinal(root), false)
  writeFileSync(path.join(root, 'entry.tsx'), `import './absent.tsx'`)
  await assert.rejects(tinyBuild(root, transformed), /absent/)
  assert.equal(readFinal(root).status, 'failed')
  assert.equal('styles' in readFinal(root), false)
})

test('mid-build authored changes cannot certify static publication from a stale source graph', async (t) => {
  const { root, transformed } = fixture(t)
  writeFileSync(path.join(root, 'unimported.tsx'), `export const tone=()=> 'bg-red-500'`)
  await tinyBuild(root, transformed, [
    {
      name: 'change-authored',
      buildEnd: {
        order: 'pre',
        handler() {
          writeFileSync(path.join(root, 'unimported.tsx'), `export const tone=()=> 'bg-blue-500'`)
        },
      },
    },
  ])
  assert.equal(readFinal(root).status, 'incomplete')
  assert.equal('styles' in readFinal(root), false)
})

test('a retired build cannot overwrite the next build collecting/final manifest after a late preparation', async (t) => {
  const { root } = fixture(t)
  const plugin = hozo({ root, css: 'tokens.css' })[0]!
  const context = {
    environment: { name: 'client' },
    resolve: async () => null,
    warn: () => {},
    addWatchFile: () => {},
    getModuleIds: () => [],
    getModuleInfo: () => null,
  }
  const gate = Promise.withResolvers<void>()
  const began = Promise.withResolvers<void>()
  const publish = ViteFinalStyleGraph.prototype.publish
  let calls = 0
  t.mock.method(
    ViteFinalStyleGraph.prototype,
    'publish',
    function (modules, runtime, prepare, theme, current) {
      calls++
      return publish.call(
        this,
        modules,
        runtime,
        calls === 1
          ? async (names, signal) => {
              began.resolve()
              await gate.promise
              return prepare(names, signal)
            }
          : prepare,
        theme,
        current,
      )
    },
  )
  plugin.configResolved.call(context, { root, command: 'build' })
  t.after(() => plugin.closeBundle.call(context))
  await plugin.buildStart.call(context)
  const old = plugin.buildEnd.call(context)
  const retired = assert.rejects(old, /retired/)
  await began.promise
  await plugin.buildStart.call(context)
  await retired
  assert.equal(readFinal(root).status, 'collecting')
  gate.resolve()
  await plugin.buildEnd.call(context)
  assert.equal(readFinal(root).status, 'complete')
})

test('an unavailable CSS snapshot replaces old final styles and preserves the existing warned lowering', async (t) => {
  const { root, transformed } = fixture(t)
  await tinyBuild(root, transformed)
  assert.equal(readFinal(root).status, 'complete')
  writeFileSync(path.join(root, 'tokens.css'), '@import "./missing.css";')
  await tinyBuild(root, transformed)
  assert.equal(readFinal(root).status, 'unavailable')
  assert.equal('styles' in readFinal(root), false)
})

test('a CSS epoch changed during the real build is incomplete, not the previous snapshot with a fresh label', async (t) => {
  const { root, transformed } = fixture(t)
  await tinyBuild(root, transformed, [
    {
      name: 'change-css',
      buildEnd: {
        order: 'pre',
        handler() {
          writeFileSync(
            path.join(root, 'tokens.css'),
            '@theme {--spacing:.5rem;} @tailwind utilities;',
          )
        },
      },
    },
  ])
  const result = readFinal(root)
  assert.equal(result.status, 'incomplete')
  assert.ok(result.issues.some(({ kind }) => kind === 'stylesheet-epoch-changed'))
  assert.equal('styles' in result, false)
})

test('a scan failure during buildStart retires old complete evidence before any transform runs', async (t) => {
  const { root, transformed } = fixture(t)
  await tinyBuild(root, transformed)
  assert.equal(readFinal(root).status, 'complete')
  const prototype = Object.getPrototypeOf(openCandidateCache())
  t.mock.method(prototype, 'isCurrent', () => {
    throw new Error('scan failed')
  })
  await assert.rejects(tinyBuild(root, transformed), /scan failed/)
  assert.equal(readFinal(root).status, 'failed')
  assert.equal('styles' in readFinal(root), false)
})

test('a finalized static graph never certifies later asset hooks or the whole bundle', async (t) => {
  const { root, transformed } = fixture(t)
  await assert.rejects(
    tinyBuild(root, transformed, [
      {
        name: 'late-output-error',
        generateBundle() {
          throw new Error('late output failed')
        },
      },
    ]),
    /late output failed/,
  )
  // Vite 8.2.4 does not call renderError/closeBundle(error) for this later
  // generateBundle failure. Graph completion cannot certify bundle success.
  const result = readFinal(root)
  assert.equal(result.status, 'complete')
  assert.equal(result.bundleValidation, 'not-assessed')
  assert.equal(result.bundleOutputPolicy, 'passthrough')
  assert.equal(result.finalOrderingReady, false)
})
