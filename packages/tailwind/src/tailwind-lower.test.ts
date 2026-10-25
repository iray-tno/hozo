import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  type Compiler,
  createCompiler,
  type PreparedModule,
  prepareTailwindContext,
} from '@hozo/compiler'
import {
  type LoweredModule,
  type LowerModuleOptions,
  type LowerModuleStage,
  lowerModule,
  prepareLowerModule,
} from '@hozo/compiler/lower'
import { StylexModuleCache, TailwindProjectSession } from '@hozo/compiler/project'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

const base = tailwindPackageDir()
const css = '@import "tailwindcss/theme.css";'
const order = async (names: readonly string[]) =>
  JSON.stringify((await prepareTailwindOrder(css, base, names)).snapshot)
const root = path.resolve('fixtures/lower-project')
const file = path.join(root, 'Page.tsx')
const nested = `import {View,Text,Avatar} from '@hozo/core';
import {Canvas} from '@hozo/canvas';
export const Row=({extra})=><View className="p-4"><Text className="text-lg">😀Label</Text>
<Avatar fallbackClassName="font-bold"/><Canvas><Canvas.Rect width={20} height={20} className="fill-red-500"/></Canvas></View>`

test('staged full lowering preserves output, derived IDs and every observed stage', async () => {
  const fixtures = [
    nested,
    `import {View,Text} from '@hozo/core';import * as stylex from '@stylexjs/stylex';
const s=stylex.create({ink:{color:'red'}});const Row=()=> <View className="p-2"><Text {...stylex.props(s.ink)} className="font-bold">Label</Text></View>`,
    `import {View} from '@hozo/core';import {Text} from '@expo/ui/swift-ui';const Row=()=> <View className="p-2"><Text>Hello</Text></View>`,
    `import {View} from '@hozo/core';import {Canvas} from '@hozo/canvas';
const Row=({active})=><View className="p-2"><Canvas><Canvas.Rect className={active?'fill-red-500':'fill-blue-500'}/></Canvas></View>`,
  ]
  for (const source of fixtures) {
    for (const id of [file, `${file}?island=one`]) {
      const compiler = createCompiler()
      const before: LowerModuleStage[] = [],
        after: LowerModuleStage[] = []
      const expected = lowerModule(source, id, file, compiler, root, undefined, {
        observe: (stage) => before.push(stage),
      })
      const session = new TailwindProjectSession(compiler, order)
      const [actual] = await session.emit(id, [
        (owner) =>
          prepareLowerModule(source, id, file, owner, root, undefined, {
            observe: (stage) => after.push(stage),
          }),
      ])
      assert.deepEqual(actual, expected)
      assert.deepEqual(after, before)
      session.invalidate()
    }
  }
})

test('the real pipeline collects once from Canvas-rewritten source and never calls ordinary primitive compilation', async () => {
  const compiler = createCompiler()
  const expected = lowerModule(nested, file, file, compiler, root)
  const prepare = compiler.prepareWebModule.bind(compiler)
  const paints = compiler.compileCanvasPaints.bind(compiler)
  let parses = 0,
    canvasPasses = 0
  compiler.prepareWebModule = (source, bindings, options) => {
    parses++
    assert.notEqual(source, nested)
    assert.doesNotMatch(source, /fill-red-500/)
    assert.match(source, /<Canvas\.Rect[^>]*fill=/)
    return prepare(source, bindings, options)
  }
  compiler.compileCanvasPaints = (...args) => {
    canvasPasses++
    return paints(...args)
  }
  compiler.compile = () => {
    throw new Error('second ordinary primitive parse')
  }
  compiler.compileNativeModule = () => {
    throw new Error('default allow path must not parse residue')
  }
  const session = new TailwindProjectSession(compiler, order)
  const [actual] = await session.emit(file, [
    (owner) => prepareLowerModule(nested, file, file, owner, root),
  ])
  assert.deepEqual(actual, expected)
  assert.equal(parses, 1)
  assert.equal(canvasPasses, 1)
  session.invalidate()
})

test('captured StyleX bindings survive registry and graph edits during preparation', async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'hozo-lower-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const definition = path.join(directory, 'styles.ts'),
    component = path.join(directory, 'Row.tsx')
  const sheet = (color: string) =>
    `import * as stylex from '@stylexjs/stylex';export const styles=stylex.create({ink:{color:'${color}'}})`
  const source = `import * as stylex from '@stylexjs/stylex';import {Text} from '@hozo/core';import {styles} from './styles';const Row=()=> <Text {...stylex.props(styles.ink)} className="p-2">Label</Text>`
  writeFileSync(definition, sheet('red'))
  writeFileSync(component, source)
  const modules = new StylexModuleCache(path.join(directory, 'cache.json'))
  modules.scanFile(definition, sheet('red'), 1)
  const compiler = createCompiler()
  compiler.setStylexModules(modules.moduleSources())
  const expected = lowerModule(source, component, component, compiler, directory, modules)
  assert.match(expected!.css, /color: red/)
  const gate = Promise.withResolvers<void>(),
    started = Promise.withResolvers<void>()
  const session = new TailwindProjectSession(compiler, async (names) => {
    started.resolve()
    await gate.promise
    return order(names)
  })
  const pending = session.emit(component, [
    (owner) => prepareLowerModule(source, component, component, owner, directory, modules),
  ])
  await started.promise
  writeFileSync(definition, sheet('blue'))
  modules.scanFile(definition, sheet('blue'), 2)
  compiler.setStylexModules(modules.moduleSources())
  gate.resolve()
  assert.deepEqual((await pending)[0], expected)
  assert.match(
    lowerModule(source, component, component, compiler, directory, modules)!.css,
    /color: blue/,
  )
  session.invalidate()
})

test('RN residue policy and observer identity are captured across await', async () => {
  const source = `import {View,VirtualizedList} from 'react-native';const Row=()=> <View className="p-2"><VirtualizedList data={[]}/></View>`
  const compiler = createCompiler()
  const before: LowerModuleStage[] = [],
    after: LowerModuleStage[] = []
  const expected = lowerModule(source, file, file, compiler, root, undefined, {
    unloweredReactNativeJsx: 'warn',
    observe: (stage) => before.push(stage),
  })
  assert.ok(expected!.diagnostics.some((entry) => entry.code === 'UNLOWERED_REACT_NATIVE_JSX'))
  const gate = Promise.withResolvers<void>(),
    started = Promise.withResolvers<void>()
  const session = new TailwindProjectSession(compiler, async (names) => {
    started.resolve()
    await gate.promise
    return order(names)
  })
  const options: LowerModuleOptions = {
    unloweredReactNativeJsx: 'warn',
    observe: (stage) => after.push(stage),
  }
  const pending = session.emit(file, [
    (owner) => prepareLowerModule(source, file, file, owner, root, undefined, options),
  ])
  await started.promise
  options.unloweredReactNativeJsx = 'error'
  options.observe = () => {
    throw new Error('mutated observer')
  }
  gate.resolve()
  assert.deepEqual((await pending)[0], expected)
  assert.deepEqual(after, before)
  session.invalidate()
})

test('one-shot lowering owns finalization and disposes on failure or explicit cancellation', async () => {
  const compiler = createCompiler()
  const source = `import {Dialog} from '@hozo/core';export function HozoDialog({children}) { return <Dialog visible>{children}</Dialog> }`
  const retained = prepareLowerModule(source, file, file, compiler, root)
  const context = prepareTailwindContext(await order(retained.candidates))
  assert.throws(() => retained.emit(context), /RUNTIME_IMPORT_COLLISION/)
  assert.throws(() => retained.emit(context), /already been emitted or disposed/)
  retained.dispose()
  retained.dispose()
  const cancelled = prepareLowerModule(nested, file, file, compiler, root)
  cancelled.dispose()
  cancelled.dispose()
  assert.throws(() => cancelled.emit(context), /already been emitted or disposed/)
  const failed = prepareLowerModule(nested, file, file, compiler, root)
  assert.throws(() => failed.emit('{}' as never), /PreparedTailwindContext|context/)
  assert.throws(() => failed.emit(context), /already been emitted or disposed/)
  const observed = prepareLowerModule(nested, file, file, compiler, root, undefined, {
    observe: (stage) => {
      if (stage.stage === 'semantic') throw new Error('observer failed')
    },
  })
  const fullContext = prepareTailwindContext(await order(observed.candidates))
  assert.throws(() => observed.emit(fullContext), /observer failed/)
  assert.throws(() => observed.emit(fullContext), /already been emitted or disposed/)
  const successful = prepareLowerModule(nested, file, file, compiler, root)
  assert.deepEqual(successful.emit(fullContext), lowerModule(nested, file, file, compiler, root))
  assert.throws(() => successful.emit(fullContext), /already been emitted or disposed/)
})

test('empty, ineligible and Canvas-only modules keep their original early-return contracts', async () => {
  const compiler = createCompiler()
  const cases = [
    { source: 'export const x = 1', file: 'empty.tsx' },
    { source: 'export const x = 1', file: 'empty.ts' },
    {
      source: `import {Canvas} from '@hozo/canvas';const Row=()=> <Canvas><Canvas.Rect className="fill-red-500"/></Canvas>`,
      file: 'canvas.tsx',
    },
    { source: `import {Platform} from 'react-native';export const os=Platform.OS`, file: 'api.ts' },
  ]
  const expected = cases.map(({ source, file }) =>
    lowerModule(source, file, file, compiler, root, undefined, { unloweredReactNativeJsx: 'warn' }),
  )
  compiler.prepareWebModule = () => {
    throw new Error('unexpected primitive parse')
  }
  const session = new TailwindProjectSession(compiler, order)
  const actual = await session.emit(
    'early',
    cases.map(
      ({ source, file }) =>
        (owner) =>
          prepareLowerModule(source, file, file, owner, root, undefined, {
            unloweredReactNativeJsx: 'warn',
          }),
    ),
  )
  assert.deepEqual(actual, expected)
  assert.equal(actual[0], undefined)
  session.invalidate()
})

test('supersession releases the whole lowering continuation and never observes old semantic edits', async () => {
  const gate = Promise.withResolvers<void>(),
    started = Promise.withResolvers<void>()
  const compiler = createCompiler()
  const session = new TailwindProjectSession(compiler, async (names) => {
    started.resolve()
    await gate.promise
    return order(names)
  })
  const oldStages: LowerModuleStage[] = []
  let old: PreparedModule<LoweredModule | undefined>
  const pending = session.emit(file, [
    (owner: Compiler) => {
      old = prepareLowerModule(nested, file, file, owner, root, undefined, {
        observe: (stage) => oldStages.push(stage),
      })
      return old
    },
  ])
  const rejected = assert.rejects(pending, (error) => error?.code === 'TAILWIND_MODULE_SUPERSEDED')
  await started.promise
  const nextSource = nested.replace('😀Label', 'NextLabel')
  const next = session.emit(file, [
    (owner) => prepareLowerModule(nextSource, file, file, owner, root),
  ])
  await rejected
  assert.equal(
    oldStages.some((stage) => stage.stage === 'semantic'),
    false,
  )
  const context = prepareTailwindContext(await order(old.candidates))
  assert.throws(() => old.emit(context), /already been emitted or disposed/)
  gate.resolve()
  assert.deepEqual((await next)[0], lowerModule(nextSource, file, file, compiler, root))
  assert.equal(
    oldStages.some((stage) => stage.stage === 'semantic'),
    false,
  )
  session.invalidate()
})
