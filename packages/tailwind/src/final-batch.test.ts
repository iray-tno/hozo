import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import {
  createCompiler,
  openCandidateCache,
  type PreparedModule,
  prepareTailwindContext,
} from '@hozo/compiler'
import { lowerModule, prepareLowerModule } from '@hozo/compiler/lower'
import { emitFinalTailwindBatch } from '@hozo/compiler/project'
import { createClassResolver } from '../../engine/src/class-resolver.ts'
import { hozoTransformStyles } from '../../engine/src/transform-slots.ts'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

const base = tailwindPackageDir()
const css = readFileSync(path.join(base, 'theme.css'), 'utf8')
const order = async (names: readonly string[]) =>
  JSON.stringify((await prepareTailwindOrder(css, base, names)).snapshot)
const source = (classes: string) =>
  `import {View} from '@hozo/core'; const padding='${classes}'; export const A=()=> <View className={padding}/>`
function runtime(id: string, revision: string, classes: string) {
  const cache = openCandidateCache()
  cache.scanFile(id, `export const tone=()=> '${classes}'`, 0)
  return { id, revision, record: cache.exportFile(id)! }
}
function tracked<T>(module: PreparedModule<T>) {
  let disposals = 0,
    emissions = 0
  let context: Parameters<PreparedModule<T>['emit']>[0] | undefined
  return {
    module: {
      candidates: module.candidates,
      emit(current) {
        emissions++
        context = current
        return module.emit(current)
      },
      dispose() {
        disposals++
        module.dispose()
      },
    } as PreparedModule<T>,
    get disposals() {
      return disposals
    },
    get emissions() {
      return emissions
    },
    get context() {
      return context
    },
  }
}

test('one exact final context contains actual static units and reconciled runtime facts without turning static classes into fallback entries', async (t) => {
  const compiler = createCompiler()
  const web = tracked(compiler.prepareWebModule(source('p-3'), undefined, { tailwindPlan: true }))
  const native = tracked(
    compiler.prepareNativeModule(source('p-4'), undefined, undefined, { tailwindPlan: true }),
  )
  const row = runtime('authored', 'one', 'p-2 p-4 bg-red-500')
  const obsolete = runtime('deleted', 'old', 'm-99')
  const deleted = tracked(compiler.prepareWebModule(source('m-99')))
  let preparations = 0
  let renderContext: typeof web.context
  const prototype = Object.getPrototypeOf(openCandidateCache())
  const render = prototype.renderNativeModulePlan
  t.mock.method(prototype, 'renderNativeModulePlan', function (context, theme) {
    renderContext = context
    return render.call(this, context, theme)
  })
  t.mock.method(prototype, 'scanFile', () => {
    throw new Error('final publication must replay native facts, not rescan')
  })
  t.mock.method(prototype, 'persist', () => {
    throw new Error('final publication must not replace a shared disk cache')
  })
  const result = await emitFinalTailwindBatch({
    expected: [
      { id: 'App.tsx?web', revision: 'w' },
      { id: 'App.tsx?native', revision: 'n' },
    ],
    collected: [
      { id: 'App.tsx?web', revision: 'w', module: web.module },
      { id: 'App.tsx?native', revision: 'n', module: native.module },
      { id: 'deleted', revision: 'old', module: deleted.module },
    ],
    runtime: { expected: [row], contributions: [row, { ...row }, obsolete] },
    async prepare(names) {
      preparations++
      assert.ok(Object.isFrozen(names))
      assert.deepEqual(names, ['bg-red-500', 'p-2', 'p-3', 'p-4'])
      return order(names)
    },
  })
  assert.equal(preparations, 1)
  assert.equal(result.fingerprint, result.native.fingerprint)
  assert.match(result.fingerprint, /^scalar-order-v4:[a-f0-9]{64}$/)
  assert.equal(web.context, native.context)
  assert.equal(
    renderContext,
    web.context,
    'the exact same native handle, not just equal rank numbers',
  )
  assert.deepEqual(
    result.native.entries.map((entry) => entry.candidate),
    ['bg-red-500', 'p-2', 'p-4'],
  )
  assert.ok(result.native.ordering)
  for (const { output } of result.modules) {
    const components = Array.isArray(output) ? output : output.components
    assert.equal(components[0].tailwindPlan?.fingerprint, result.fingerprint)
    assert.equal(components[0].tailwindPlan?.mode, 'scalar-order-v4')
  }
  assert.deepEqual(result.ignoredModules, [{ id: 'deleted', revision: 'old' }])
  assert.deepEqual(result.ignoredRuntimeSources, ['deleted'])
  assert.equal(deleted.emissions, 0)
  for (const tracked of [web, native, deleted]) assert.equal(tracked.disposals, 1)
  assert.equal(compiler.inspectTailwindOrder(source('p-2')).fingerprint, undefined)
})

test('a completed batch changes both static targets and the actual generated factory call, not ordinary sessions', async () => {
  const compiler = createCompiler()
  const classes = 'p-4 p-2 w-8 w-4 bg-[#112233] bg-[#223344]'
  const row = runtime('runtime', 'one', classes)
  const snapshot = await order(classes.split(' '))
  const ordinary = prepareTailwindContext(snapshot)
  const oldWeb = compiler.prepareWebModule(source(classes)).emit(ordinary)[0]!
  const oldNative = compiler.prepareNativeModule(source(classes)).emit(ordinary).components[0]!
  const result = await emitFinalTailwindBatch({
    expected: [
      { id: 'w', revision: 'one' },
      { id: 'n', revision: 'one' },
    ],
    collected: [
      { id: 'w', revision: 'one', module: compiler.prepareWebModule(source(classes)) },
      { id: 'n', revision: 'one', module: compiler.prepareNativeModule(source(classes)) },
    ],
    runtime: { expected: [row], contributions: [row] },
    prepare: async () => snapshot,
  })
  const web = result.modules.find(({ id }) => id === 'w')!.output
  const native = result.modules.find(({ id }) => id === 'n')!.output
  assert.ok(Array.isArray(web) && !Array.isArray(native))
  assert.notEqual(
    result.fingerprint,
    ordinary.fingerprint,
    'output policy is part of cache identity',
  )
  assert.notEqual(web[0]!.css, oldWeb.css)
  assert.notEqual(native.components[0]!.styles, oldNative.styles)
  assert.match(native.components[0]!.styles, /paddingTop: 16/)
  assert.match(native.components[0]!.styles, /width: 32/)
  const resolver = runInNewContext(
    result.native.code.replace(/^import .*$/gm, '').replaceAll('export const ', 'const ') +
      '\nhozoClasses',
    { createClassResolver },
  )
  const resolved = Object.assign({}, ...resolver(classes))
  assert.equal(resolved.paddingTop, 16)
  assert.equal(resolved.width, 32)
  const legacy = openCandidateCache()
  legacy.importFile(row.id, row.record, 0)
  assert.match(
    legacy.renderNativeModulePlan(ordinary).code,
    /createClassResolver\(styles, unsupported\)/,
  )
  assert.match(result.native.code, /createClassResolver\(\{ schema: 1/)
  assert.doesNotMatch(
    result.native.code,
    /scalar-order-v\d+:|candidateId|specificity|propertyOrder/,
  )
  assert.equal(compiler.prepareWebModule(source(classes)).emit(ordinary)[0]!.css, oldWeb.css)
})

test('empty/static-only/runtime-only batches still prepare once and keep fallback membership exact', async () => {
  const compiler = createCompiler()
  for (const mode of ['empty', 'static', 'runtime']) {
    let calls = 0
    const module = compiler.prepareWebModule(source('p-3'))
    const row = runtime('runtime', 'one', 'p-2')
    const hasStatic = mode === 'static',
      hasRuntime = mode === 'runtime'
    if (!hasStatic) module.dispose()
    const result = await emitFinalTailwindBatch({
      expected: hasStatic ? [{ id: 'module', revision: 'one' }] : [],
      collected: hasStatic ? [{ id: 'module', revision: 'one', module }] : [],
      runtime: { expected: hasRuntime ? [row] : [], contributions: hasRuntime ? [row] : [] },
      async prepare(names) {
        calls++
        return order(names)
      },
    })
    assert.equal(calls, 1)
    assert.equal(result.native.fingerprint, result.fingerprint)
    assert.deepEqual(result.candidates, hasStatic ? ['p-3'] : hasRuntime ? ['p-2'] : [])
    assert.equal(result.native.entries.length, hasRuntime ? 1 : 0)
  }
})

test('unassessed emitted objects keep the whole string on its old path, including ambient and transform composition', async () => {
  for (const classes of ['p-4 p-2 ps-2', 'p-4 p-2 rotate-45 rtl:p-4']) {
    const row = runtime('runtime', 'one', classes)
    const compiler = createCompiler()
    const oldWeb = compiler.compile(source(classes))[0]!
    const oldNative = compiler.compileNativeModule(source(classes)).components[0]!
    const result = await emitFinalTailwindBatch({
      expected: [
        { id: 'w', revision: 'one' },
        { id: 'n', revision: 'one' },
      ],
      collected: [
        { id: 'w', revision: 'one', module: compiler.prepareWebModule(source(classes)) },
        { id: 'n', revision: 'one', module: compiler.prepareNativeModule(source(classes)) },
      ],
      runtime: { expected: [row], contributions: [row] },
      prepare: order,
    })
    const web = result.modules.find(({ id }) => id === 'w')!.output
    const native = result.modules.find(({ id }) => id === 'n')!.output
    assert.ok(Array.isArray(web) && !Array.isArray(native))
    assert.equal(web[0]!.css, oldWeb.css)
    assert.equal(native.components[0]!.styles, oldNative.styles)
    for (const isRTL of [false, true]) {
      const resolve = runInNewContext(
        result.native.code.replace(/^import .*$/gm, '').replaceAll('export const ', 'const ') +
          '\nhozoClasses',
        { createClassResolver, hozoTransformStyles, I18nManager: { isRTL } },
      )
      const resolved = Object.assign({}, ...resolve(classes))
      assert.equal(resolved.paddingTop, isRTL && classes.includes('rtl:') ? 16 : 8)
      if (classes.includes('rotate')) assert.equal(resolved.transform[0].rotate, '45deg')
    }
  }
})

test('a ranked rule with a mismatched actual owner is a barrier in both static and generated output', async () => {
  const classes = 'p-4 p-2 active:p-4'
  const row = runtime('runtime', 'one', classes)
  const compiler = createCompiler()
  const oldWeb = compiler.compile(source(classes))[0]!
  const oldNative = compiler.compileNativeModule(source(classes)).components[0]!
  const result = await emitFinalTailwindBatch({
    expected: [
      { id: 'w', revision: 'one' },
      { id: 'n', revision: 'one' },
    ],
    collected: [
      { id: 'w', revision: 'one', module: compiler.prepareWebModule(source(classes)) },
      { id: 'n', revision: 'one', module: compiler.prepareNativeModule(source(classes)) },
    ],
    runtime: { expected: [row], contributions: [row] },
    async prepare(names) {
      const snapshot = JSON.parse(await order(names))
      const active = snapshot.candidates.find((entry) => entry.candidate === 'active:p-4')
      active.rules = JSON.parse(JSON.stringify(active.rules).replaceAll('&:active', '&:focus'))
      return JSON.stringify(snapshot)
    },
  })
  const web = result.modules.find(({ id }) => id === 'w')!.output
  const native = result.modules.find(({ id }) => id === 'n')!.output
  assert.ok(Array.isArray(web) && !Array.isArray(native))
  assert.equal(web[0]!.css, oldWeb.css)
  assert.equal(native.components[0]!.styles, oldNative.styles)
  assert.equal(result.native.ordering?.ranks['active:p-4'], undefined)
  const resolve = runInNewContext(
    result.native.code.replace(/^import .*$/gm, '').replaceAll('export const ', 'const ') +
      '\nhozoClasses',
    { createClassResolver },
  )
  assert.equal(Object.assign({}, ...resolve(classes, { pressed: false })).paddingTop, 8)
  assert.equal(Object.assign({}, ...resolve(classes, { pressed: true })).paddingTop, 16)
})

test('the same publication accepts the real post-Canvas full lowering handle, not only primitive output arrays', async () => {
  const compiler = createCompiler()
  const file = path.join(process.cwd(), 'fixtures', 'Final.tsx')
  const source = `import {View} from '@hozo/core';import {Canvas} from '@hozo/canvas';
    const padding='p-3';export const A=()=> <View className={padding}><Canvas><Canvas.Rect width={20} height={20} className="fill-red-500"/></Canvas></View>`
  const expected = lowerModule(source, file, file, compiler, process.cwd())
  const module = tracked(prepareLowerModule(source, file, file, compiler, process.cwd()))
  const result = await emitFinalTailwindBatch({
    expected: [{ id: file, revision: 'one' }],
    collected: [{ id: file, revision: 'one', module: module.module }],
    runtime: { expected: [], contributions: [] },
    prepare: order,
  })
  assert.deepEqual(result.modules[0]!.output, expected)
  assert.deepEqual(result.candidates, ['p-3'])
  assert.equal(module.emissions, 1)
  assert.equal(module.disposals, 1)
})

test('collection snapshots graph/theme/runtime facts before async preparation and disposes ignored stale handles', async () => {
  const theme = { colors: [], spacingPx: 8 }
  const compiler = createCompiler(theme)
  const actual = tracked(compiler.prepareNativeModule(source('p-4')))
  const stale = tracked(compiler.prepareWebModule(source('m-99')))
  const row = runtime('runtime', 'one', 'p-2')
  const expected = [{ id: 'module', revision: 'one' }]
  const collected = [
    { id: 'module', revision: 'one', module: actual.module },
    { id: 'module', revision: 'old', module: stale.module },
  ]
  const facts = [row]
  const gate = Promise.withResolvers<void>()
  const pending = emitFinalTailwindBatch({
    expected,
    collected,
    theme,
    runtime: { expected: [row], contributions: facts },
    async prepare(names) {
      await gate.promise
      return JSON.stringify(
        (await prepareTailwindOrder('@theme {--spacing:.5rem;} @tailwind utilities;', base, names))
          .snapshot,
      )
    },
  })
  assert.equal(stale.disposals, 1, 'ignored IR is released before waiting for the current epoch')
  expected[0]!.revision = 'changed'
  collected.length = 0
  facts[0]!.record = '{}'
  theme.spacingPx = 999
  gate.resolve()
  const result = await pending
  assert.equal(result.modules[0]!.revision, 'one')
  assert.deepEqual(result.ignoredModules, [{ id: 'module', revision: 'old' }])
  assert.deepEqual(result.candidates, ['p-2', 'p-4'])
  assert.match(result.native.code, /paddingTop: 16/)
  assert.doesNotMatch(result.native.code, /1998/)
  assert.equal(stale.emissions, 0)
  assert.equal(stale.disposals, 1)
  assert.equal(actual.disposals, 1)
})

test('bad/incomplete preparation and a later emission failure return no partial assets and dispose the entire batch', async () => {
  const compiler = createCompiler()
  for (const prepare of [
    async () => '{',
    async () => order([]),
    async () => {
      throw new Error('rejected')
    },
  ]) {
    const a = tracked(compiler.prepareWebModule(source('p-2')))
    await assert.rejects(
      emitFinalTailwindBatch({
        expected: [{ id: 'a', revision: 'one' }],
        collected: [{ id: 'a', revision: 'one', module: a.module }],
        runtime: { expected: [], contributions: [] },
        prepare,
      }),
    )
    assert.equal(a.disposals, 1)
    assert.equal(a.emissions, 0)
  }
  const a = tracked(compiler.prepareWebModule(source('p-2')))
  const b = tracked(compiler.prepareWebModule(source('p-4')))
  b.module.emit = () => {
    throw new Error('second emission failed')
  }
  await assert.rejects(
    emitFinalTailwindBatch({
      expected: [
        { id: 'a', revision: 'one' },
        { id: 'b', revision: 'one' },
      ],
      collected: [
        { id: 'a', revision: 'one', module: a.module },
        { id: 'b', revision: 'one', module: b.module },
      ],
      runtime: { expected: [], contributions: [] },
      prepare: order,
    }),
    /second emission failed/,
  )
  assert.equal(a.emissions, 1)
  assert.equal(a.disposals, 1)
  assert.equal(b.disposals, 1)
  const consumed = tracked(compiler.prepareWebModule(source('p-2')))
  consumed.module.dispose()
  await assert.rejects(
    emitFinalTailwindBatch({
      expected: [{ id: 'consumed', revision: 'one' }],
      collected: [{ id: 'consumed', revision: 'one', module: consumed.module }],
      runtime: { expected: [], contributions: [] },
      prepare: order,
    }),
    /already been emitted or disposed/,
  )
})

test('cancellation during non-cooperative preparation releases IR promptly and never emits a late result', async () => {
  const compiler = createCompiler(),
    controller = new AbortController()
  const module = tracked(compiler.prepareWebModule(source('p-2')))
  const gate = Promise.withResolvers<string>()
  const reason = new Error('epoch invalidated')
  const pending = emitFinalTailwindBatch({
    expected: [{ id: 'a', revision: 'one' }],
    collected: [{ id: 'a', revision: 'one', module: module.module }],
    runtime: { expected: [], contributions: [] },
    signal: controller.signal,
    prepare: () => gate.promise,
  })
  controller.abort(reason)
  await assert.rejects(pending, (error) => error === reason)
  assert.equal(module.disposals, 1)
  assert.equal(module.emissions, 0)
  gate.resolve(await order(['p-2']))
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(module.emissions, 0)
})

test('last-emission cancellation and candidate-render failures cannot publish successful earlier components', async (t) => {
  const compiler = createCompiler(),
    controller = new AbortController()
  const module = tracked(compiler.prepareWebModule(source('p-2')))
  const emit = module.module.emit
  module.module.emit = (context) => {
    const output = emit(context)
    controller.abort(new Error('changed while emitting'))
    return output
  }
  await assert.rejects(
    emitFinalTailwindBatch({
      expected: [{ id: 'a', revision: 'one' }],
      collected: [{ id: 'a', revision: 'one', module: module.module }],
      runtime: { expected: [], contributions: [] },
      signal: controller.signal,
      prepare: order,
    }),
    /changed while emitting/,
  )
  assert.equal(module.disposals, 1)
  const second = tracked(compiler.prepareWebModule(source('p-2')))
  t.mock.method(Object.getPrototypeOf(openCandidateCache()), 'renderNativeModulePlan', () => {
    throw new Error('candidate render failed')
  })
  await assert.rejects(
    emitFinalTailwindBatch({
      expected: [{ id: 'b', revision: 'one' }],
      collected: [{ id: 'b', revision: 'one', module: second.module }],
      runtime: { expected: [], contributions: [] },
      prepare: order,
    }),
    /candidate render failed/,
  )
  assert.equal(second.emissions, 1)
  assert.equal(second.disposals, 1)
  const enumeration = tracked(compiler.prepareWebModule(source('p-2')))
  t.mock.method(Object.getPrototypeOf(openCandidateCache()), 'candidates', () => {
    throw new Error('candidate enumeration failed')
  })
  await assert.rejects(
    emitFinalTailwindBatch({
      expected: [{ id: 'c', revision: 'one' }],
      collected: [{ id: 'c', revision: 'one', module: enumeration.module }],
      runtime: { expected: [], contributions: [] },
      prepare: order,
    }),
    /candidate enumeration failed/,
  )
  assert.equal(enumeration.emissions, 0)
  assert.equal(enumeration.disposals, 1)
})
