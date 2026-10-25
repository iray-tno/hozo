import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { createCompiler, prepareTailwindContext } from '@hozo/compiler'
import {
  StylexModuleCache,
  TailwindCandidateUniverse,
  TailwindProjectSession,
} from '@hozo/compiler/project'
import { prepareTailwindOrder, tailwindPackageDir } from '@hozo/tailwind'
import { transformHozoSource, transformHozoSourceOrPrepare } from './transform.ts'

const root = path.resolve('fixtures/staged-native')
const file = path.join(root, 'Row.tsx')
const serialize = async (names) =>
  JSON.stringify(
    (await prepareTailwindOrder('@import "tailwindcss/theme.css";', tailwindPackageDir(), names))
      .snapshot,
  )
const contextFor = async (names) => prepareTailwindContext(await serialize(names))
const source = `import {View,Text,Avatar} from '@hozo/core';import {Canvas} from '@hozo/canvas';
  export const Row=()=> <View className="p-2"><Avatar fallbackClassName="font-bold"/><Text className="text-lg">😀Label</Text><Canvas><Canvas.Rect className="fill-red-500"/></Canvas></View>`

test('ordinary and staged Native finalization preserve complete code and diagnostics across module shapes', async (t) => {
  let warnings: string[] = []
  t.mock.method(console, 'warn', (message) => warnings.push(message))
  for (const input of [
    source,
    `import {View as Box,Text} from 'react-native';import {Button as Foreign} from '@expo/ui/swift-ui';export const Row=()=> <Box className="p-2"><Foreign>OK</Foreign><Text>Text</Text></Box>`,
    `import {View,Text} from '@hozo/core';export function Row(){return <><View className="md:p-4"/><Text className="dark:text-red-500">😀Text</Text></>}`,
    `import {Svg} from '@hozo/svg';export const Row=()=> <Svg><Svg.Rect width={10} height={10}/></Svg>`,
    `import {Text} from '@hozo/core';export const Row=()=> <Text className="text-lg font-bold">Test</Text>`,
    `import {View} from '@hozo/core';export const Row=()=> <View className={chooseClasses()}/>`,
    `import {Chip} from '@hozo/core';export const Row=()=> <Chip removeClassName="focus-visible:text-red-500">Tag</Chip>`,
    `import {Canvas} from '@hozo/canvas';export const Row=()=> <Canvas><Canvas.Rect className="fill-red-500"/></Canvas>`,
    `import {View} from '@hozo/core';export const x=1`,
    `export const x=1`,
    `import {View} from '@hozo/core';export const x=<View className= >`,
  ]) {
    const compiler = createCompiler()
    warnings = []
    const expected = transformHozoSource(input, file, root, compiler)
    const expectedWarnings = [...warnings]
    warnings = []
    const result = transformHozoSourceOrPrepare(input, file, root, compiler)
    const actual =
      result.kind === 'complete'
        ? result.output
        : result.module.emit(await contextFor(result.module.candidates))
    assert.deepEqual(actual, expected)
    assert.deepEqual(warnings, expectedWarnings)
    if (result.kind === 'prepared') result.module.dispose()
  }
})

test('the session stages exactly one post-Canvas parse and uses direct Native emission when ready', async (t) => {
  const compiler = createCompiler()
  const expected = transformHozoSource(source, file, root, compiler)
  const session = new TailwindProjectSession(compiler, serialize)
  t.after(() => session.invalidate())
  const universe = new TailwindCandidateUniverse(['p-2', 'font-bold', 'text-lg', 'fill-red-500'])
  let parses = 0,
    attempts = 0
  const prepare = compiler.prepareNativeModule.bind(compiler)
  compiler.prepareNativeModule = (...args) => {
    parses++
    assert.doesNotMatch(args[0], /fill-red-500/)
    assert.match(args[0], /<Canvas\.Rect[^>]*fill=/)
    return prepare(...args)
  }
  compiler.compileNativeModule = () => {
    throw new Error('no ordinary module reparse')
  }
  compiler.compileNative = () => {
    throw new Error('no components-only metadata reparse')
  }
  compiler.setTailwindOrder = () => {
    throw new Error('no global context setter')
  }
  const run = () =>
    session.runModule(file, universe, (owner, context) =>
      transformHozoSourceOrPrepare(source, file, root, owner, context),
    )
  assert.equal(await run(), expected)
  const ready = compiler.compileNativeOrPrepare.bind(compiler)
  compiler.compileNativeOrPrepare = (...args) => {
    attempts++
    const value = ready(...args)
    assert.ok('components' in value)
    return value
  }
  const signals = t.mock.method(AbortSignal, 'any', () => {
    throw new Error('ready work must not wait for context')
  })
  assert.equal(await run(), expected)
  assert.equal(parses, 1)
  assert.equal(attempts, 1)
  assert.equal(signals.mock.callCount(), 0)
})

test('Native retained finalization is one-shot and disposes even when imports cannot be completed', async () => {
  const compiler = createCompiler()
  const result = transformHozoSourceOrPrepare(source, file, root, compiler)
  assert.equal(result.kind, 'prepared')
  if (result.kind !== 'prepared') return
  const context = await contextFor(result.module.candidates)
  result.module.dispose()
  result.module.dispose()
  assert.throws(() => result.module.emit(context), /already been emitted or disposed/)
  const missing = `import {View} from '@hozo/core';export const Row=()=> <View className={chooseClasses()}/>`
  assert.throws(() => transformHozoSource(missing, file, undefined, compiler), /no projectRoot/)
  const pending = transformHozoSourceOrPrepare(missing, file, undefined, compiler)
  assert.equal(pending.kind, 'prepared')
  if (pending.kind !== 'prepared') return
  assert.throws(() => pending.module.emit(context), /no projectRoot/)
  assert.throws(() => pending.module.emit(context), /already been emitted or disposed/)
  pending.module.dispose()
})

test('helpers, imported StyleX and text-forwarding facts are captured before preparation suspends', async (t) => {
  t.mock.method(console, 'warn', () => {})
  const compiler = createCompiler()
  compiler.setClassHelpers([{ module: '@/utils', name: 'cn' }])
  compiler.setTextForwarding([
    {
      module: 'labels',
      components: [{ name: 'Label', props: [], variants: [{ when: [], classes: 'text-lg' }] }],
    },
  ])
  const cache = new StylexModuleCache()
  const styles = path.join(root, 'styles.ts')
  cache.scanFile(
    styles,
    `import * as stylex from '@stylexjs/stylex';export const styles=stylex.create({root:{padding:12}})`,
    1,
  )
  const input = `import {View,Text} from '@hozo/core';import * as stylex from '@stylexjs/stylex';import {styles} from './styles';import {cn} from '@/utils';import {Label} from 'labels';
    export const Row=()=> <View className={cn('p-2')} {...stylex.props(styles.root)}><Label><Text className="font-bold">Text</Text></Label></View>`
  cache.scanFile(file, input, 1)
  compiler.setStylexModules(cache.moduleSources())
  const expected = transformHozoSource(input, file, root, compiler, cache)
  assert.match(expected, /padding: 12|paddingTop: 12/)
  assert.doesNotMatch(expected, /stylex\.props|hozoClasses/)
  const result = transformHozoSourceOrPrepare(input, file, root, compiler, undefined, cache)
  assert.equal(result.kind, 'prepared')
  if (result.kind !== 'prepared') return
  compiler.setClassHelpers([])
  compiler.setTextForwarding([])
  cache.scanFile(styles, `export const styles={root:{padding:99}}`, 2)
  compiler.setStylexModules(cache.moduleSources())
  assert.notEqual(transformHozoSource(input, file, root, compiler, cache), expected)
  assert.equal(result.module.emit(await contextFor(result.module.candidates)), expected)
})

test('staged Native finalization keeps hard diagnostics and runtime import-collision checks', async (t) => {
  t.mock.method(console, 'warn', () => {})
  for (const input of [
    `import {View} from '@hozo/core';const row=<View className="inline-block"/>`,
    `import {View} from '@hozo/core';const row=<View className="md:p-4"/>`,
    `import {Dialog} from '@hozo/core';export function HozoDialog({children}){return <Dialog visible>{children}</Dialog>}`,
  ]) {
    const compiler = createCompiler()
    let expected: Error | undefined
    try {
      transformHozoSource(input, file, root, compiler)
    } catch (error) {
      expected = error
    }
    assert.ok(expected, 'fixture must actually fail ordinary finalization')
    const result = transformHozoSourceOrPrepare(input, file, root, compiler)
    assert.equal(result.kind, 'prepared')
    if (result.kind !== 'prepared') continue
    const context = await contextFor(result.module.candidates)
    assert.throws(
      () => result.module.emit(context),
      (error) => error.message === expected!.message,
    )
    assert.throws(() => result.module.emit(context), /already been emitted or disposed/)
  }
})

test('project invalidation releases old Native continuations without emitting semantic source edits', async () => {
  const gate = Promise.withResolvers<void>(),
    started = Promise.withResolvers<void>()
  const session = new TailwindProjectSession(createCompiler(), async (names) => {
    started.resolve()
    await gate.promise
    return serialize(names)
  })
  const output = session.runModule(file, [], (compiler, context) =>
    transformHozoSourceOrPrepare(source, file, root, compiler, context),
  )
  const rejected = assert.rejects(output, { code: 'TAILWIND_PROJECT_INVALIDATED' })
  await started.promise
  session.invalidate()
  gate.resolve()
  await rejected
})

test('no-op and Canvas-only modules never allocate a primitive continuation', () => {
  const compiler = createCompiler()
  compiler.prepareNativeModule = () => {
    throw new Error('unexpected primitive parse')
  }
  compiler.compileNativeOrPrepare = () => {
    throw new Error('unexpected primitive ready parse')
  }
  for (const [input, name] of [
    [source, 'Row.css'],
    ['export const x=1', 'Row.tsx'],
    [
      `import {Canvas} from '@hozo/canvas';const x=<Canvas><Canvas.Rect className="fill-red-500"/></Canvas>`,
      'Canvas.tsx',
    ],
  ]) {
    const result = transformHozoSourceOrPrepare(input, name, root, compiler)
    assert.equal(result.kind, 'complete')
  }
})
