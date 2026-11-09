import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createCompiler,
  prepareAuthoredTailwindContext,
  prepareFinalTailwindContext,
} from '@hozo/compiler'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

// #1230, the rest of domain 4 of the inventory
// (docs/measurements/tailwind-order-inventory.md). A line clamp stayed a
// barrier because Web emitted its `display`/`overflow` after every other
// write; `@container` had no ownership entry.
const css = '@import "tailwindcss/theme.css" layer(theme); @tailwind utilities;'
const view = (classes: string) =>
  `import {View} from '@hozo/core';export const A=()=> <View className="${classes}"/>`
const text = (classes: string) =>
  `import {Text} from '@hozo/core';export const A=()=> <Text className="${classes}">Label</Text>`
const inputs: [string[], (classes: string) => string][] = [
  [['line-clamp-2', 'line-clamp-3'], text],
  [['line-clamp-2', 'line-clamp-none'], text],
  [['line-clamp-2', 'flex'], view],
  [['line-clamp-2', 'overflow-visible', 'p-4', 'p-2'], text],
  [['@container', '@container-normal', 'p-4', 'p-2'], view],
]

test('line clamps and query containers settle in Tailwind order, whichever is written first', async () => {
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
  assert.ok(differs >= 4, `authored order differed in ${differs}`)
  // `flex` after the clamp's `display: -webkit-box`, as Tailwind emits it.
  const flex = compiler.prepareWebModule(view('flex line-clamp-2')).emit(final)[0]!.css
  assert.ok(flex.indexOf('display: -webkit-box') < flex.lastIndexOf('display: flex'), flex)
  // Tailwind's three lines over two reach Native too.
  assert.match(native(text('line-clamp-3 line-clamp-2')).jsx, /numberOfLines=\{3\}/)
})
