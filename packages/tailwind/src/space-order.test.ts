import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createCompiler,
  prepareAuthoredTailwindContext,
  prepareFinalTailwindContext,
} from '@hozo/compiler'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

// #1230. `space-*` was an unassessed selector, so an input with one kept
// its authored order; `space-y-*` held eight class lists of this
// repository on that path (docs/measurements/tailwind-order-coverage.md).
const css = '@import "tailwindcss/theme.css" layer(theme); @tailwind utilities;'
const inputs = [
  ['space-y-4', 'space-y-2'],
  ['space-x-4', 'space-x-2'],
  ['space-y-2', 'p-4', 'p-2'],
  ['md:space-y-4', 'space-y-8', 'space-y-2'],
  ['space-y-2', 'space-x-4', 'mt-4', 'mt-2'],
]
const source = (classes: string, child = '') =>
  `import {View} from '@hozo/core';export const A=()=> <View className="${classes}"><View className="${child}"/><View/><View/></View>`

test('space utilities settle in Tailwind order among themselves, whichever is written first', async () => {
  const names = [...new Set([...inputs.flat(), 'hover:space-y-4', 'mt-8'])]
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), names)
  const final = prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
  const authored = prepareAuthoredTailwindContext(JSON.stringify(prepared.snapshot))
  const compiler = createCompiler()
  let differs = 0
  for (const input of inputs) {
    const web = [input, input.toReversed()].map(
      (names) => compiler.prepareWebModule(source(names.join(' '))).emit(final)[0]!,
    )
    assert.deepEqual(web[0]!.diagnostics, web[1]!.diagnostics, input.join(' '))
    assert.equal(web[0]!.css, web[1]!.css, input.join(' '))
    const native = [input, input.toReversed()].map(
      (names) => compiler.prepareNativeModule(source(names.join(' '))).emit(final).components[0]!,
    )
    assert.deepEqual(native[0]!.diagnostics, native[1]!.diagnostics, input.join(' '))
    assert.equal(native[0]!.styles, native[1]!.styles, input.join(' '))
    assert.equal(native[0]!.jsx, native[1]!.jsx, input.join(' '))
    const old = [input, input.toReversed()].map(
      (names) =>
        compiler.prepareNativeModule(source(names.join(' '))).emit(authored).components[0]!.styles +
        compiler.prepareWebModule(source(names.join(' '))).emit(authored)[0]!.css,
    )
    if (old[0] !== old[1]) differs++
  }
  assert.ok(differs >= 3, `authored order differed in ${differs}`)
  // Tailwind's winner, `space-y-4` after `space-y-2`, and on Native too.
  const ranked = (classes: string) =>
    compiler.prepareNativeModule(source(classes)).emit(final).components[0]!
  assert.equal(ranked('space-y-4 space-y-2').styles, ranked('space-y-4').styles)
  // A child's own margin still wins over the parent's gap, as before.
  const child = compiler.prepareWebModule(source('space-y-2', 'mt-8')).emit(final)[0]!
  const childNative = compiler.prepareNativeModule(source('space-y-2', 'mt-8')).emit(final)
  assert.match(child.css, /margin-top: 32px/)
  assert.match(childNative.components[0]!.styles, /marginTop: 32/)
  // A state variant on a child-scoped rule weighs nothing in Tailwind, so it
  // is not read: the input keeps authored order.
  for (const classes of ['hover:space-y-4 p-4 p-2', 'hover:space-y-4 p-2 p-4'])
    assert.equal(
      compiler.prepareWebModule(source(classes)).emit(final)[0]!.css,
      compiler.prepareWebModule(source(classes)).emit(authored)[0]!.css,
    )
  // A space utility no longer holds a padding conflict on the old path.
  const padding = compiler.prepareWebModule(source('p-4 p-2 space-y-2')).emit(final)[0]!
  assert.match(padding.css, /padding-top: 16px/)
  assert.doesNotMatch(padding.css, /padding-top: 8px/)
})
