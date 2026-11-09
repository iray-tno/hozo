import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createCompiler,
  prepareAuthoredTailwindContext,
  prepareFinalTailwindContext,
} from '@hozo/compiler'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

// #1230, domain 5 of the inventory (docs/measurements/tailwind-order-inventory.md):
// `*:`, `**:` and `starting:` were unassessed, so an input with one kept its
// authored order.
const css = '@import "tailwindcss/theme.css" layer(theme); @tailwind utilities;'
const source = (classes: string) =>
  `import {View,Text} from '@hozo/core';export const A=()=> <View className="${classes}"><View/><Text>Label</Text></View>`
const inputs = [
  ['*:p-4', '*:p-2'],
  ['*:p-2', 'p-4', 'p-2'],
  ['**:opacity-50', '**:opacity-75'],
  ['starting:opacity-0', 'starting:opacity-50'],
  ['starting:opacity-0', 'opacity-75', 'opacity-50'],
]

test('subtree and starting-style variants settle in Tailwind order, whichever is written first', async () => {
  const names = [...new Set(inputs.flat())]
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), names)
  const final = prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
  const authored = prepareAuthoredTailwindContext(JSON.stringify(prepared.snapshot))
  const compiler = createCompiler()
  const native = (classes: string, context = final) =>
    compiler.prepareNativeModule(source(classes)).emit(context).components[0]!
  let differs = 0
  for (const input of inputs) {
    const web = [input, input.toReversed()].map(
      (names) => compiler.prepareWebModule(source(names.join(' '))).emit(final)[0]!,
    )
    assert.deepEqual(web[0]!.diagnostics, web[1]!.diagnostics, input.join(' '))
    assert.equal(web[0]!.css, web[1]!.css, input.join(' '))
    const both = [input, input.toReversed()].map((names) => native(names.join(' ')))
    assert.deepEqual(both[0], both[1], input.join(' '))
    const old = [input, input.toReversed()].map(
      (names) =>
        JSON.stringify(native(names.join(' '), authored)) +
        compiler.prepareWebModule(source(names.join(' '))).emit(authored)[0]!.css,
    )
    if (old[0] !== old[1]) differs++
  }
  assert.ok(differs >= 4, `authored order differed in ${differs}`)
})
