import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createCompiler,
  prepareAuthoredTailwindContext,
  prepareFinalTailwindContext,
} from '@hozo/compiler'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

// #1230, the last domain 3 gaps of the inventory
// (docs/measurements/tailwind-order-inventory.md): `drop-shadow-none` and
// `via-none`, two resets of a register that later rules can still read.
const css = '@import "tailwindcss/theme.css" layer(theme); @tailwind utilities;'
const source = (classes: string) =>
  `import {View} from '@hozo/core';export const A=()=> <View className="${classes}"/>`
const inputs = [
  ['drop-shadow-none', 'drop-shadow-md'],
  ['drop-shadow-red-500', 'drop-shadow-md', 'drop-shadow-none'],
  ['drop-shadow-none', 'drop-shadow-red-500'],
  ['md:drop-shadow-none', 'drop-shadow-lg'],
  ['bg-linear-to-r', 'from-red-500', 'via-blue-500', 'to-green-500', 'via-none'],
  ['md:via-none', 'bg-linear-to-r', 'from-red-500', 'via-blue-500', 'to-green-500'],
  ['bg-linear-to-r', 'from-red-500', 'to-green-500', 'via-none', 'p-4', 'p-2'],
]

test('drop-shadow-none and via-none settle in Tailwind order, whichever is written first', async () => {
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
  assert.ok(differs >= 3, `authored order differed in ${differs}`)
  // A colour rebuilds the size's shadow even after `drop-shadow-none`, as
  // Tailwind's colour rule reads `--tw-drop-shadow-size`.
  const colour = compiler
    .prepareWebModule(source('drop-shadow-red-500 drop-shadow-md drop-shadow-none'))
    .emit(final)[0]!.css
  assert.match(colour, /filter: drop-shadow\(0 3px 3px /)
  // `md:drop-shadow-none` turns the shadow off at md with a valid `none`.
  const md = compiler
    .prepareWebModule(source('md:drop-shadow-none drop-shadow-lg'))
    .emit(final)[0]!.css
  assert.match(md, /@media \(width >= 768px\) \{\n {2}\.hozo-0 \{\n {4}filter: none;/)
})
