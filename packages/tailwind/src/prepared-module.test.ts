import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createCompiler, prepareTailwindContext } from '@hozo/compiler'
import { emitTailwindModules } from '@hozo/compiler/project'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

const base = tailwindPackageDir()
const css = readFileSync(path.join(base, 'theme.css'), 'utf8')
const order = async (names: readonly string[]) =>
  JSON.stringify((await prepareTailwindOrder(css, base, names)).snapshot)
const empty = () => order([]).then(prepareTailwindContext)
const strip = (outputs) => outputs.map(({ tailwindPlan: _plan, ...output }) => output)

test('collect actual retained candidates, await one complete context, then emit the owned Web/Native parses', async () => {
  const compiler = createCompiler()
  const helpers = [{ module: './join', name: 'joinClasses' }]
  compiler.setClassHelpers(helpers)
  const source = `import {Pressable,View,Text,Avatar} from '@hozo/core';
    import {Modal} from 'react-native'; import {joinClasses} from './join';
    const small='p-2'; const wide='px-4';
    export const A=({ready,extra})=><Pressable className={joinClasses(small,wide,ready && 'hover:p-4',extra)}>
      <Avatar fallbackClassName="font-bold"/>{ready && <Text className="text-lg">😀</Text>}
      <Unknown><View className="w-[23px]"/></Unknown><Modal visible={ready}/>
    </Pressable>;`
  const options = { rehomeReactNative: true, tagEvidence: true, tailwindPlan: true }
  const webBefore = compiler.compile(source, undefined, options)
  const nativeBefore = compiler.compileNativeModule(source)
  const web = compiler.prepareWebModule(source, undefined, options)
  const native = compiler.prepareNativeModule(source, undefined, undefined, { tailwindPlan: true })
  assert.ok(
    web.candidates.includes('px-4'),
    'resolved constant-alias utility belongs to the actual collected IR',
  )
  assert.ok(web.candidates.includes('font-bold'), 'secondary slot contributes')
  assert.ok(Object.isFrozen(web.candidates))
  const modules = [web, native]
  const extras = ['notautility', 'bg-red-500']
  let release!: () => void
  const barrier = new Promise<void>((resolve) => {
    release = resolve
  })
  let calls = 0,
    snapshot = ''
  const pending = emitTailwindModules(
    modules,
    async (names) => {
      calls++
      assert.ok(Object.isFrozen(names))
      assert.deepEqual(
        names,
        [...new Set([...web.candidates, ...native.candidates, ...extras])].sort(),
      )
      await barrier
      snapshot = await order(names)
      return snapshot
    },
    extras,
  )
  // Neither configuration changes nor caller-array mutation across await
  // may change the already parsed module or captured universe.
  modules.length = 0
  extras.push('h-99')
  options.rehomeReactNative = false
  options.tagEvidence = false
  compiler.setClassHelpers([])
  compiler.setTailwindOrder = () => {
    throw new Error('batch must not use a global context setter')
  }
  compiler.compile = () => {
    throw new Error('must not call the source compiler at emit time')
  }
  compiler.compileNativeModule = () => {
    throw new Error('must not call the source compiler at emit time')
  }
  release()
  const [webAfter, nativeAfter] = await pending
  assert.equal(calls, 1)
  assert.deepEqual(strip(webAfter), strip(webBefore))
  assert.deepEqual({ ...nativeAfter, components: strip(nativeAfter.components) }, nativeBefore)
  const fingerprint = JSON.parse(snapshot).fingerprint
  for (const output of [...webAfter, ...nativeAfter.components]) {
    assert.equal(output.tailwindPlan.fingerprint, fingerprint)
    assert.ok(
      output.tailwindPlan.sites
        .flatMap((site) => site.blocks)
        .every((block) => block.status !== 'uncollected'),
    )
  }
  const context = prepareTailwindContext(snapshot)
  assert.throws(() => web.emit(context), /already been emitted or disposed/)
  assert.throws(() => native.emit(context), /already been emitted or disposed/)
  web.dispose()
  native.dispose()
})

test('overlapping async batches on one compiler keep independent universes and contexts', async () => {
  const compiler = createCompiler()
  const source = (name) => `import {View} from '@hozo/core';const el=<View className="${name}"/>`
  const options = { tailwindPlan: true }
  const first = compiler.prepareWebModule(source('p-2'), undefined, options)
  const second = compiler.prepareWebModule(source('p-4'), undefined, options)
  let release!: () => void
  const barrier = new Promise<void>((resolve) => {
    release = resolve
  })
  const pending = emitTailwindModules([first], async (names) => {
    await barrier
    return order(names)
  })
  const [b] = await emitTailwindModules([second], order)
  release()
  const [a] = await pending
  assert.notEqual(a[0].tailwindPlan.fingerprint, b[0].tailwindPlan.fingerprint)
  for (const [output, name] of [
    [a, 'p-2'],
    [b, 'p-4'],
  ]) {
    assert.ok(
      output[0].tailwindPlan.sites
        .flatMap((site) => site.blocks)
        .some((block) => block.candidate === name && block.status === 'described'),
    )
  }
  assert.equal(
    compiler.inspectTailwindOrder(source('p-2')).fingerprint,
    undefined,
    'no installed mutable context leaked out of a batch',
  )
})

test('preparation, validation, duplicate ownership and external cancellation release every owned module', async () => {
  const compiler = createCompiler()
  const make = () =>
    compiler.prepareWebModule(`import {View} from '@hozo/core';const el=<View className="p-2"/>`)
  const context = await empty()
  for (const prepare of [
    async () => {
      throw new Error('preparation rejected')
    },
    async () => '{',
    async () => order([]),
    async (names) => {
      await prepareTailwindOrder('@plugin "./never-run.cjs";', base, names)
      return ''
    },
  ]) {
    const a = make(),
      b = make()
    await assert.rejects(emitTailwindModules([a, b], prepare))
    assert.throws(() => a.emit(context), /already been emitted or disposed/)
    assert.throws(() => b.emit(context), /already been emitted or disposed/)
  }
  const duplicate = make()
  await assert.rejects(
    emitTailwindModules([duplicate, duplicate], async () => {
      throw new Error('should not prepare')
    }),
    /occurs twice/,
  )
  assert.throws(() => duplicate.emit(context), /already been emitted or disposed/)
  const cancelled = make()
  await assert.rejects(
    emitTailwindModules([cancelled], async (names) => {
      cancelled.dispose()
      return order(names)
    }),
    /already been emitted or disposed/,
  )
  assert.throws(() => cancelled.emit(context), /already been emitted or disposed/)
  const usable = make()
  assert.throws(() => usable.emit({}), 'a wrong context class must fail before consuming the IR')
  assert.ok(usable.emit(prepareTailwindContext(await order(['p-2']))).length)
})

test('Native grammar, forwarding and text ABI choices survive the boundary', async () => {
  const compiler = createCompiler()
  const forwarding = [
    {
      module: 'labels',
      components: [{ name: 'Label', props: [], variants: [{ when: [], classes: 'text-lg' }] }],
    },
  ]
  compiler.setTextForwarding(forwarding)
  const source = `import {Text} from '@hozo/core';import {Label} from 'labels';export const A=()=> <Label><Text className="font-bold">Value</Text></Label>`
  const expected = compiler.compileNativeModule(source)
  const staged = compiler.prepareNativeModule(source)
  compiler.setTextForwarding([])
  assert.deepEqual((await emitTailwindModules([staged], order))[0], expected)
  const plain = `import {Text} from '@hozo/core';export const A=()=> <Text className="text-lg">Value</Text>`
  for (const options of [
    {},
    { textReference: true },
    { textInheritance: true },
    { textInheritance: true, textStatic: true },
  ]) {
    const expected = compiler.compileNativeModule(plain, undefined, undefined, options)
    const staged = compiler.prepareNativeModule(plain, undefined, undefined, options)
    assert.deepEqual((await emitTailwindModules([staged], order))[0], expected)
  }
  const broken = `import {View} from '@hozo/core'; const el=<View className= >`
  const failure = compiler.compileNativeModule(broken, undefined, 'broken.tsx')
  assert.ok(failure.syntaxDiagnostics.length)
  assert.deepEqual(
    (
      await emitTailwindModules(
        [compiler.prepareNativeModule(broken, undefined, 'broken.tsx')],
        order,
      )
    )[0],
    failure,
  )
  assert.throws(
    () => compiler.prepareNativeModule(plain, undefined, undefined, { textStatic: true }),
    /requires textInheritance/,
  )
})

test('staged font diagnostics retain their own immutable availability facts', async () => {
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
  const source = `import {Text} from '@hozo/core';import * as stylex from '@stylexjs/stylex';
    const styles=stylex.create({root:{fontFamily:'Inter',fontWeight:900}});
    const el=<Text {...stylex.props(styles.root)}>Value</Text>`
  const before = compiler.compile(source)
  const nativeBefore = compiler.compileNativeModule(source)
  assert.ok(before[0].diagnostics.some((item) => item.code === 'FONT_VARIANT_NOT_REGISTERED'))
  const web = compiler.prepareWebModule(source),
    native = compiler.prepareNativeModule(source)
  fonts.families.length = 0
  const [a, b] = await emitTailwindModules([web, native], order)
  assert.deepEqual(a, before)
  assert.deepEqual(b, nativeBefore)
})
