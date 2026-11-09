import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createCompiler,
  prepareAuthoredTailwindContext,
  prepareFinalTailwindContext,
} from '@hozo/compiler'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

// #1230, domain 4 of the inventory (docs/measurements/tailwind-order-inventory.md):
// the logical sizes, `origin-*`, `truncate`, `whitespace-*` and
// `text-ellipsis` had no ownership entry, so an input with one kept its
// authored order. Native's truncation also read the first line clamp, and
// any `whitespace-nowrap`, whichever came last.
const css = '@import "tailwindcss/theme.css" layer(theme); @tailwind utilities;'
const view = (classes: string) =>
  `import {View} from '@hozo/core';export const A=()=> <View className="${classes}"/>`
const text = (classes: string) =>
  `import {Text} from '@hozo/core';export const A=()=> <Text className="${classes}">Label</Text>`
const inputs: [string[], (classes: string) => string][] = [
  [['inline-8', 'w-4'], view],
  [['block-8', 'h-4'], view],
  [['min-inline-8', 'min-w-4', 'max-inline-16', 'max-w-4'], view],
  [['inline-8', 'p-4', 'p-2'], view],
  [['origin-top', 'origin-left'], view],
  [['truncate', 'whitespace-normal'], text],
  [['whitespace-nowrap', 'text-ellipsis', 'text-clip'], text],
]

test('logical sizes, origins and truncation settle in Tailwind order, whichever is written first', async () => {
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
  assert.ok(differs >= 5, `authored order differed in ${differs}`)
  // Tailwind's winner reaches Native: `whitespace-normal` after `truncate`
  // leaves the text wrapping, whichever is written first.
  assert.doesNotMatch(native(text('whitespace-normal truncate')).jsx, /numberOfLines/)
  // The clamps are not in this context, so they keep authored order, and
  // Native takes the last one, as CSS does (ranked: line-clamp-container-order).
  assert.match(native(text('line-clamp-2 line-clamp-3')).jsx, /numberOfLines=\{3\}/)
  assert.match(native(text('line-clamp-3 line-clamp-2')).jsx, /numberOfLines=\{2\}/)
  // A logical size no longer holds a padding conflict on the old path.
  const padding = compiler.prepareWebModule(view('p-4 p-2 inline-8')).emit(final)[0]!
  assert.match(padding.css, /padding-top: 16px/)
  assert.doesNotMatch(padding.css, /padding-top: 8px/)
})
