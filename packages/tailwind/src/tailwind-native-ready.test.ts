import assert from 'node:assert/strict'
import test from 'node:test'
import {
  type CompiledNativeModule,
  type Compiler,
  createCompiler,
  type NativeCompileOptions,
  prepareTailwindContext,
} from '@hozo/compiler'
import {
  TailwindCandidateUniverse,
  type TailwindModuleAttempt,
  TailwindProjectSession,
} from '@hozo/compiler/project'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

const names = ['p-2', 'font-bold', 'text-lg', 'notautility']
const order = async (names: readonly string[]) =>
  JSON.stringify(
    (await prepareTailwindOrder('@import "tailwindcss/theme.css";', tailwindPackageDir(), names))
      .snapshot,
  )
const source = (padding = 'p-2') =>
  `import {Text,View,Avatar} from '@hozo/core';export const Row=()=> <View className="${padding}"><Avatar fallbackClassName="font-bold"/><Text className="text-lg font-bold">😀Label</Text></View>`
const attempt = (
  compiler: Compiler,
  input: string,
  context?,
  options?: NativeCompileOptions,
): TailwindModuleAttempt<CompiledNativeModule> => {
  const value = context
    ? compiler.compileNativeOrPrepare(input, context, undefined, 'Label.tsx', options)
    : compiler.prepareNativeModule(input, undefined, 'Label.tsx', options)
  return 'components' in value
    ? { kind: 'complete', output: value }
    : { kind: 'prepared', module: value }
}

test('ready Native emission preserves complete metadata, syntax diagnostics and every text ABI option', async () => {
  const compiler = createCompiler()
  const serialized = await order(names),
    context = prepareTailwindContext(serialized)
  compiler.setTailwindOrder(serialized)
  const fixtures = [
    source(),
    source('p-2 notautility'),
    `import {View as Box} from 'react-native';import {Button as Foreign} from '@expo/ui/swift-ui';const Row=()=> <Box className="p-2"><Foreign>Hello</Foreign></Box>`,
    `import {View} from '@hozo/core';const Row=()=> <View className= >`,
    `import {View} from '@hozo/core';export const value=1`,
  ]
  for (const input of fixtures) {
    for (const options of [
      {},
      { textReference: true },
      { textInheritance: true },
      { textInheritance: true, textStatic: true },
      { tailwindPlan: true },
    ]) {
      const expected = compiler.compileNativeModule(input, undefined, 'Label.tsx', options)
      const actual = compiler.compileNativeOrPrepare(
        input,
        context,
        undefined,
        'Label.tsx',
        options,
      )
      assert.ok('components' in actual, 'complete contexts return a module, not a handle')
      assert.deepEqual(actual, expected)
    }
  }
})

test('Native misses retain parsed forwarding and text choices across later compiler/option mutation', async () => {
  const compiler = createCompiler()
  compiler.setTextForwarding([
    {
      module: 'labels',
      components: [{ name: 'Label', props: [], variants: [{ when: [], classes: 'text-lg' }] }],
    },
  ])
  const input = `import {Text,View} from '@hozo/core';import {Label} from 'labels';export const Row=()=> <View className="p-4"><Label><Text className="font-bold">Text</Text></Label></View>`
  const options = { textInheritance: true, textStatic: true }
  const expected = compiler.compileNativeModule(input, undefined, 'Forwarded.tsx', options)
  const value = compiler.compileNativeOrPrepare(
    input,
    prepareTailwindContext(await order(names)),
    undefined,
    'Forwarded.tsx',
    options,
  )
  assert.ok(!('components' in value))
  assert.ok(value.candidates.includes('p-4'))
  compiler.setTextForwarding([])
  options.textInheritance = false
  options.textStatic = false
  const complete = prepareTailwindContext(await order([...names, 'p-4']))
  assert.deepEqual(value.emit(complete), expected)
  assert.throws(() => value.emit(complete), /already been emitted or disposed/)
  value.dispose()
})

test('the shared session uses the Native ready call without a global setter, reparse or wait signals', async (t) => {
  const compiler = createCompiler(),
    input = source(),
    universe = new TailwindCandidateUniverse(names)
  const expected = compiler.compileNativeModule(input, undefined, 'Label.tsx')
  let preparations = 0,
    direct = 0
  const session = new TailwindProjectSession(compiler, async (names) => {
    preparations++
    return order(names)
  })
  const run = () =>
    session.runModule('file', universe, (owner, context) => attempt(owner, input, context))
  assert.deepEqual(await run(), expected)
  const compile = compiler.compileNativeOrPrepare.bind(compiler)
  compiler.compileNativeOrPrepare = (...args) => {
    direct++
    const result = compile(...args)
    assert.ok('components' in result)
    return result
  }
  compiler.compileNativeModule = () => {
    throw new Error('unexpected ordinary reparse')
  }
  compiler.prepareNativeModule = () => {
    throw new Error('unexpected retained handle')
  }
  compiler.setTailwindOrder = () => {
    throw new Error('unexpected global context setter')
  }
  t.mock.method(AbortSignal, 'any', () => {
    throw new Error('ready Native result must not wait')
  })
  assert.deepEqual(await run(), expected)
  assert.equal(direct, 1)
  assert.equal(preparations, 1)
  const pending = session.runModule('file', universe, (owner, context) => {
    const result = attempt(owner, input, context)
    queueMicrotask(() => session.invalidate())
    return result
  })
  await assert.rejects(pending, (error) => error?.code === 'TAILWIND_PROJECT_INVALIDATED')
})

test('Native ready attempts reject incompatible text options before returning hit or retained results', async () => {
  const compiler = createCompiler(),
    context = prepareTailwindContext(await order(names))
  for (const input of [source(), source('p-4')]) {
    assert.throws(
      () =>
        compiler.compileNativeOrPrepare(input, context, undefined, undefined, {
          textReference: true,
          textInheritance: true,
        }),
      /Select one/,
    )
    assert.throws(
      () =>
        compiler.compileNativeOrPrepare(input, context, undefined, undefined, { textStatic: true }),
      /requires textInheritance/,
    )
  }
})

test('a 1026-name context cannot hide a missing candidate in a later Web or Native root', async () => {
  const compiler = createCompiler()
  const many = [
    ...Array.from({ length: 1024 }, (_, index) => `p-${index + 1}`),
    'font-bold',
    'text-lg',
  ]
  const context = prepareTailwindContext(await order(many))
  const input = `${source()}\nexport const Later=()=> <View className="p-2048"/>`
  const web = compiler.compileWebOrPrepare(input, context)
  const native = compiler.compileNativeOrPrepare(input, context, undefined, 'Large.tsx')
  assert.equal(Array.isArray(web), false)
  assert.ok(!Array.isArray(web))
  assert.ok(!('components' in native))
  assert.ok(web.candidates.includes('p-2048'))
  assert.ok(native.candidates.includes('p-2048'))
  const expanded = prepareTailwindContext(await order([...many, 'p-2048']))
  assert.deepEqual(web.emit(expanded), compiler.compile(input))
  assert.deepEqual(
    native.emit(expanded),
    compiler.compileNativeModule(input, undefined, 'Large.tsx'),
  )
})

test('a Native miss snapshots font availability while a direct hit uses the current call facts', async () => {
  const fonts = {
    families: [
      {
        id: 'body',
        names: { web: 'Inter', ios: 'Inter', android: 'Inter' },
        external: [],
        faces: [
          { platforms: ['web', 'ios', 'android'], weightFrom: 400, weightTo: 400, style: 'normal' },
        ],
      },
    ],
  }
  const compiler = createCompiler(undefined, undefined, fonts)
  const input = `import {Text} from '@hozo/core';import * as stylex from '@stylexjs/stylex';const s=stylex.create({root:{fontFamily:'Inter',fontWeight:900}});const Row=()=> <Text className="p-4" {...stylex.props(s.root)}>Label</Text>`
  const expected = compiler.compileNativeModule(input)
  assert.ok(
    expected.components[0].diagnostics.some(
      (entry) => entry.code === 'FONT_VARIANT_NOT_REGISTERED',
    ),
  )
  const pending = compiler.compileNativeOrPrepare(input, prepareTailwindContext(await order(names)))
  assert.ok(!('components' in pending))
  fonts.families.length = 0
  const complete = prepareTailwindContext(await order([...names, 'p-4']))
  assert.deepEqual(pending.emit(complete), expected)
  const actual = compiler.compileNativeOrPrepare(input, complete)
  assert.ok('components' in actual)
  assert.deepEqual(actual, compiler.compileNativeModule(input))
})
