import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createCompiler,
  prepareAuthoredTailwindContext,
  prepareFinalTailwindContext,
} from '@hozo/compiler'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

// #1230, domain 3 of the inventory (docs/measurements/tailwind-order-inventory.md):
// every transform axis rule also writes the shared declaration (`translate`,
// `scale`, `transform`) in its own form, and the last such rule decides it.
// The resets, `scale-3d` and `scale-z-*`'s three-value form, and
// `transform`/`-cpu`/`-gpu` were not ranked, and Web emitted a reset before
// the composed axes, so `scale-none scale-50` kept the scale.
const css = '@import "tailwindcss/theme.css" layer(theme); @tailwind utilities;'
const source = (classes: string) =>
  `import {View} from '@hozo/core';export const A=()=> <View className="${classes}"/>`
const inputs = [
  ['scale-z-50', 'scale-50'],
  ['scale-3d', 'scale-x-50'],
  ['scale-none', 'scale-50'],
  ['translate-none', 'translate-x-2'],
  ['translate-x-2', 'translate-none', 'translate-y-4'],
  ['rotate-none', 'rotate-45'],
  ['transform-none', 'rotate-x-45'],
  ['transform-gpu', 'rotate-x-45'],
  ['md:translate-none', 'translate-x-2'],
  ['scale-z-50', 'scale-x-75', 'p-4', 'p-2'],
]

test('transform resets and forms settle in Tailwind order, whichever is written first', async () => {
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
  // Tailwind sorts `scale-none` after `scale-50`: the reset wins on Web, in
  // either written order.
  const web = compiler.prepareWebModule(source('scale-none scale-50')).emit(final)[0]!.css
  assert.match(web, /scale: none;/)
  assert.doesNotMatch(web, /scale: 50%/)
})
