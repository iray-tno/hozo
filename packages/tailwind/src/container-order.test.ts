import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createCompiler,
  prepareAuthoredTailwindContext,
  prepareFinalTailwindContext,
} from '@hozo/compiler'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

// #1230, the last domain 4 gap of the inventory
// (docs/measurements/tailwind-order-inventory.md): `container` is one rule
// with a `max-width` per breakpoint. Each write is now matched to its
// branch, and a branch an unprefixed later write of the same property
// always beats in Tailwind is dropped, since both backends apply a
// conditional style after the unconditional ones.
const css = '@import "tailwindcss/theme.css" layer(theme); @tailwind utilities;'
const source = (classes: string) =>
  `import {View} from '@hozo/core';export const A=()=> <View className="${classes}"/>`
const inputs = [
  ['container', 'p-4', 'p-2'],
  ['container', 'max-w-5xl'],
  ['container', 'md:max-w-none'],
  ['container', 'w-auto'],
  ['container', 'lg:max-w-xs', 'mx-auto'],
]

test('container settles in Tailwind order, whichever is written first', async () => {
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
  assert.ok(differs >= 1, `authored order differed in ${differs}`)
  // Tailwind sorts `max-w-5xl` after `container`, so the container's
  // breakpoint widths never apply: neither backend emits them.
  const web = compiler.prepareWebModule(source('max-w-5xl container')).emit(final)[0]!.css
  assert.doesNotMatch(web, /@media/)
  assert.doesNotMatch(native('max-w-5xl container').styles, /maxWidth: 640/)
})
