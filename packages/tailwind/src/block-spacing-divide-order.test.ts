import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createCompiler,
  prepareAuthoredTailwindContext,
  prepareFinalTailwindContext,
} from '@hozo/compiler'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

// #1230, domain 2 of the inventory (docs/measurements/tailwind-order-inventory.md):
// Tailwind 4.3's block-logical spacing (`pbs-*`, `pbe-*`, `mbs-*`, `mbe-*`),
// divider widths and colours and the reverse flags had no ownership entry,
// so an input with one kept its authored order.
const css = '@import "tailwindcss/theme.css" layer(theme); @tailwind utilities;'
const source = (classes: string) =>
  `import {View} from '@hozo/core';export const A=()=> <View className="${classes}"><View/><View/><View/></View>`
const inputs = [
  ['pbs-8', 'pt-4'],
  ['pbe-8', 'pb-4', 'py-2'],
  ['mbs-8', 'mt-4'],
  ['mbe-8', 'mb-4', 'p-4', 'p-2'],
  ['divide-y-4', 'divide-y-2'],
  ['divide-red-500', 'divide-blue-500', 'divide-y'],
  ['divide-x-2', 'divide-x', 'divide-x-reverse'],
  ['space-y-4', 'space-y-reverse', 'space-y-2'],
]

test('block-logical spacing, dividers and reverse flags settle in Tailwind order, whichever is written first', async () => {
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
  assert.ok(differs >= 6, `authored order differed in ${differs}`)
  // A divider style still keeps authored order: it sets the register every
  // divider width reads, and Hozo writes the literal style.
  for (const classes of ['divide-dashed divide-y p-4 p-2', 'divide-y divide-dashed p-2 p-4'])
    assert.equal(
      compiler.prepareWebModule(source(classes)).emit(final)[0]!.css,
      compiler.prepareWebModule(source(classes)).emit(authored)[0]!.css,
    )
})
