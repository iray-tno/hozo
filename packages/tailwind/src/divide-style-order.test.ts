import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createCompiler,
  prepareAuthoredTailwindContext,
  prepareFinalTailwindContext,
} from '@hozo/compiler'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

// #1230, domain 3 of the inventory (docs/measurements/tailwind-order-inventory.md):
// a divider width's implied `solid` is now written beneath every written
// style (the base layer on Web, nothing on Native), so a divider style
// (`divide-dashed`) ranks, as Tailwind's `--tw-border-style` register lets
// it win wherever it applies.
const css = '@import "tailwindcss/theme.css" layer(theme); @tailwind utilities;'
const source = (classes: string) =>
  `import {View} from '@hozo/core';export const A=()=> <View className="${classes}"><View/><View/><View/></View>`
const inputs = [
  ['divide-dashed', 'divide-y-2'],
  ['divide-dotted', 'divide-dashed', 'divide-x'],
  ['divide-dashed', 'md:divide-y-4'],
  ['divide-none', 'divide-y'],
  ['divide-solid', 'divide-dashed', 'divide-y-2', 'p-4', 'p-2'],
]

test('written divider styles settle in Tailwind order and beat a width’s implied style anywhere', async () => {
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
  // The implied style is in the base layer on Web and absent on Native.
  const web = compiler.prepareWebModule(source('divide-dashed md:divide-y-4')).emit(final)[0]!.css
  assert.match(web, /@layer base \{\n {4}:where\(\.hozo-0 > :not\(:last-child\)\) \{/)
  assert.doesNotMatch(native('divide-dashed md:divide-y-4').styles, /borderStyle: 'solid'/)
})
