import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createCompiler,
  prepareAuthoredTailwindContext,
  prepareFinalTailwindContext,
} from '@hozo/compiler'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

// #1230, domain 3 of the inventory (docs/measurements/tailwind-order-inventory.md):
// a written border style (`border-dashed`) kept its input in authored
// order, because a width's implied `solid` could override it once ranked.
// That implied style is now `BorderStyle::Default`: zero specificity on Web,
// nothing on Native, so a written style wins wherever it applies, as
// Tailwind's `--tw-border-style` register does.
const css = '@import "tailwindcss/theme.css" layer(theme); @tailwind utilities;'
const view = (classes: string) =>
  `import {View} from '@hozo/core';export const A=()=> <View className="${classes}"/>`
const text = (classes: string) =>
  `import {Text} from '@hozo/core';export const A=()=> <Text className="${classes}">Label</Text>`
const inputs: [string[], (classes: string) => string][] = [
  [['border-dashed', 'border-2'], view],
  [['border-dashed', 'border-dotted', 'border'], view],
  [['border-dashed', 'md:border-4'], view],
  [['hover:border-dashed', 'md:border-2'], view],
  [['border-dashed', 'border-t-2', 'p-4', 'p-2'], view],
  [['border-solid', 'border-dashed', 'border-2'], text],
]

test('written border styles settle in Tailwind order and beat a width’s implied style anywhere', async () => {
  const names = [...new Set(inputs.flatMap(([names]) => names))]
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), names)
  const final = prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
  const authored = prepareAuthoredTailwindContext(JSON.stringify(prepared.snapshot))
  const compiler = createCompiler()
  const native = (source: string, context = final) =>
    compiler.prepareNativeModule(source).emit(context).components[0]!
  let differs = 0
  for (const [input, source] of inputs) {
    const web = [input, input.toReversed()].map(
      (names) => compiler.prepareWebModule(source(names.join(' '))).emit(final)[0]!,
    )
    assert.deepEqual(web[0]!.diagnostics, web[1]!.diagnostics, input.join(' '))
    assert.equal(web[0]!.css, web[1]!.css, input.join(' '))
    const both = [input, input.toReversed()].map((names) => native(source(names.join(' '))))
    assert.deepEqual(both[0], both[1], input.join(' '))
    const old = [input, input.toReversed()].map(
      (names) =>
        JSON.stringify(native(source(names.join(' ')), authored)) +
        compiler.prepareWebModule(source(names.join(' '))).emit(authored)[0]!.css,
    )
    if (old[0] !== old[1]) differs++
  }
  assert.ok(differs >= 2, `authored order differed in ${differs}`)
  // A width's implied style is a zero-specificity rule on Web and nothing on
  // Native, so `md:border-4` cannot turn an unconditional dashed solid.
  const web = compiler.prepareWebModule(view('border-dashed md:border-4')).emit(final)[0]!.css
  assert.match(web, /:where\(\.hozo-0\) \{\n {4}border-top-style: solid;/)
  const styles = native(view('border-dashed md:border-4')).styles
  assert.match(styles, /borderStyle: 'dashed'/)
  assert.doesNotMatch(styles, /borderStyle: 'solid'/)
})
