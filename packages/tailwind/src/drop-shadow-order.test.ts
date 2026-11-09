import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createCompiler,
  prepareAuthoredTailwindContext,
  prepareFinalTailwindContext,
} from '@hozo/compiler'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

// #1230, domain 3 of the inventory (docs/measurements/tailwind-order-inventory.md):
// `drop-shadow-*` and its colours, 298 classes, kept their input in
// authored order. Each is one register in Tailwind, the size's and the
// colour's.
const css = '@import "tailwindcss/theme.css" layer(theme); @tailwind utilities;'
const source = (classes: string) =>
  `import {View} from '@hozo/core';export const A=()=> <View className="${classes}"/>`
const inputs = [
  ['drop-shadow-md', 'drop-shadow-lg'],
  ['drop-shadow-red-500', 'drop-shadow-blue-500', 'drop-shadow-md'],
  ['drop-shadow-md', 'blur-sm', 'grayscale'],
  ['drop-shadow-lg', 'p-4', 'p-2'],
  ['md:drop-shadow-xl', 'drop-shadow-sm', 'drop-shadow-md'],
]

test('drop shadows and their colours settle in Tailwind order, whichever is written first', async () => {
  const names = [...new Set([...inputs.flat(), 'drop-shadow-none'])]
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
  assert.ok(differs >= 3, `authored order differed in ${differs}`)
  // `drop-shadow-none` writes the shadow register itself and keeps
  // authored order.
  for (const classes of [
    'drop-shadow-none drop-shadow-md p-4 p-2',
    'drop-shadow-md drop-shadow-none p-2 p-4',
  ])
    assert.equal(
      compiler.prepareWebModule(source(classes)).emit(final)[0]!.css,
      compiler.prepareWebModule(source(classes)).emit(authored)[0]!.css,
    )
})
