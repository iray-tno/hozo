import assert from 'node:assert/strict'
import test from 'node:test'
import { type CompiledNativeModule, createCompiler, prepareTailwindContext } from './index.ts'

const source = `// 😀 日本語 offsets\r\nimport { View, Text } from '@hozo/core';
export const C=()=> <View className="p-2"><Tools title="同じ😀"/>{ok && <Text className="font-bold"><Tools title="同じ😀"/></Text>}<Tools title="同じ😀"/></View>`

function checked(
  module: CompiledNativeModule,
  plain: CompiledNativeModule,
  authoredSource = source,
) {
  const copies: string[] = []
  assert.equal(module.components.length, 1)
  module.components.forEach(({ sourceCopies, ...rest }, index) => {
    const { sourceCopies: absent, ...ordinary } = plain.components[index]!
    assert.equal(absent, undefined)
    assert.deepEqual(rest, ordinary, 'collecting evidence cannot change ordinary output')
    assert.ok(sourceCopies?.length)
    let end = 0
    for (const copy of sourceCopies) {
      assert.ok(copy.emittedStart >= end)
      const authored = authoredSource.slice(copy.spanStart, copy.spanEnd)
      assert.equal(rest.jsx.slice(copy.emittedStart, copy.emittedEnd), authored)
      copies.push(authored)
      end = copy.emittedEnd
    }
  })
  assert.equal(copies.join('').match(/<Tools title="同じ😀"\/>/g)?.length, 3)
  assert.ok(!copies.join('').includes('className="p-2"'))
  assert.ok(!copies.join('').includes('className="font-bold"'))
}

test('ordinary Native source evidence converts authored and emitted UTF-16 offsets per call', () => {
  const compiler = createCompiler()
  const plain = compiler.compileNativeModule(source)
  const traced = compiler.compileNativeModule(source, undefined, undefined, {
    sourceEvidence: true,
  })
  checked(traced, plain)
  assert.deepEqual(compiler.compileNativeModule(source), plain)
  assert.deepEqual(
    compiler.compileNativeModule(source, undefined, undefined, { sourceEvidence: false }),
    plain,
  )
})

test('retained Native IR owns the evidence option through cold and warm emission', () => {
  const compiler = createCompiler()
  const context = prepareTailwindContext(
    JSON.stringify({
      schema: 1,
      policy: 'tailwind-rule-signatures-v1',
      tailwindVersion: 'native-source-evidence-unit',
      fingerprint: 'c'.repeat(64),
      stylesheets: [],
      candidates: [],
    }),
  )
  const plain = compiler.prepareNativeModule(source).emit(context)
  const options = { sourceEvidence: true }
  const retained = compiler.prepareNativeModule(source, undefined, undefined, options)
  options.sourceEvidence = false
  checked(retained.emit(context), plain)
  assert.throws(() => retained.emit(context), /emitted or disposed/)
  const cold = compiler.compileNativeOrPrepare(source, context, undefined, undefined, {
    sourceEvidence: true,
  })
  assert.ok(!('components' in cold))
  checked(cold.emit(context), plain)
  const warmSource = source.replace(' className="p-2"', '').replace(' className="font-bold"', '')
  const warm = compiler.compileNativeOrPrepare(warmSource, context, undefined, undefined, {
    sourceEvidence: true,
  })
  assert.ok('components' in warm)
  checked(warm, compiler.compileNativeModule(warmSource), warmSource)
  const disposed = compiler.prepareNativeModule(source, undefined, undefined, {
    sourceEvidence: true,
  })
  disposed.dispose()
  assert.throws(() => disposed.emit(context), /emitted or disposed/)
})

test('Native source evidence cannot silently switch to an owner or text experiment', () => {
  const compiler = createCompiler()
  for (const option of ['ownerStyle', 'textReference', 'textInheritance', 'textStatic'])
    for (const method of ['compileNativeModule', 'prepareNativeModule'] as const)
      assert.throws(
        () =>
          compiler[method](source, undefined, undefined, { sourceEvidence: true, [option]: true }),
        /sourceEvidence requires ordinary Native lowering/,
      )
})

test('Native passthrough-prop copies keep UTF-16 ranges through a nested primitive', () => {
  const input = `// 😀 日本語\r\nimport {View,Text} from '@hozo/core';
    export const C=()=> <View className="p-2" header={<Tools title="同じ😀"/>}
    renderItem={item => <Text className="font-bold"><Tools title="同じ😀"/></Text>}/>`
  const compiler = createCompiler()
  const plain = compiler.compileNativeModule(input)
  const observed = compiler.compileNativeModule(input, undefined, undefined, {
    sourceEvidence: true,
  })
  const { sourceCopies, ...actual } = observed.components[0]!
  const { sourceCopies: absent, ...ordinary } = plain.components[0]!
  assert.equal(absent, undefined)
  assert.deepEqual(actual, ordinary)
  assert.ok(sourceCopies?.length)
  for (const copy of sourceCopies)
    assert.equal(
      input.slice(copy.spanStart, copy.spanEnd),
      actual.jsx.slice(copy.emittedStart, copy.emittedEnd),
    )
  const carried = sourceCopies.map((copy) => input.slice(copy.spanStart, copy.spanEnd)).join('')
  assert.equal(carried.match(/<Tools title="同じ😀"\/>/g)?.length, 2)
  assert.ok(carried.includes('renderItem={item => '))
  assert.ok(!carried.includes('className="font-bold"'))
  assert.deepEqual(compiler.compileNativeModule(input), plain)
})
