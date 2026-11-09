import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createCompiler,
  prepareAuthoredTailwindContext,
  prepareFinalTailwindContext,
} from '@hozo/compiler'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

// #1230, domain 3 of the inventory (docs/measurements/tailwind-order-inventory.md):
// as for borders, an outline width's implied `solid` is
// `BorderStyle::Default`, so a written outline style ranks and wins wherever
// it applies, as Tailwind's `--tw-outline-style` register does.
const css = '@import "tailwindcss/theme.css" layer(theme); @tailwind utilities;'
const source = (classes: string) =>
  `import {Pressable} from '@hozo/core';export const A=()=> <Pressable accessibilityLabel="x" className="${classes}"/>`
const inputs = [
  ['outline-dashed', 'outline-2'],
  ['outline-dashed', 'focus:outline-2'],
  ['focus:outline-dotted', 'outline-4'],
  ['outline-dashed', 'outline-dotted', 'outline'],
  ['outline-solid', 'outline-dashed', 'md:outline-2', 'p-4', 'p-2'],
]

test('written outline styles settle in Tailwind order and beat a width’s implied style anywhere', async () => {
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
  assert.ok(differs >= 2, `authored order differed in ${differs}`)
  // Native writes no `'solid'` for a width's implied style.
  const styles = native('outline-dashed focus:outline-2').styles
  assert.match(styles, /outlineStyle: 'dashed'/)
  assert.doesNotMatch(styles, /outlineStyle: 'solid'/)
})
