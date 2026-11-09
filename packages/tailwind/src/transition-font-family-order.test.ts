import assert from 'node:assert/strict'
import test from 'node:test'
import { createCompiler, prepareFinalTailwindContext } from '@hozo/compiler'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

// #1230. Transition utilities and font families had no ownership entry, so
// any input with one kept its authored order -- in this repository's own
// corpus, `transition-colors` alone held 15 class lists on that path
// (docs/measurements/tailwind-order-coverage.md).
const css = '@import "tailwindcss/theme.css" layer(theme); @tailwind utilities;'
const inputs = [
  ['transition-colors', 'transition'],
  ['transition', 'duration-150', 'duration-300'],
  ['duration-300', 'transition-colors'],
  ['ease-in', 'ease-out', 'transition'],
  ['delay-100', 'delay-200'],
  ['font-mono', 'font-sans'],
  ['md:font-mono', 'font-sans'],
  ['p-2', 'p-4', 'transition-colors'],
]
const source = (classes: string) =>
  `import {Pressable} from '@hozo/core';export const A=()=> <Pressable accessibilityRole="button" className="${classes}"/>`

test('transitions and font families settle in Tailwind order, whichever is written first', async () => {
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), [
    ...new Set(inputs.flat()),
  ])
  const final = prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
  const compiler = createCompiler()
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
  }
  // A transition no longer holds a padding conflict on the old path.
  const padding = compiler.prepareWebModule(source('p-4 p-2 transition-colors')).emit(final)[0]!
  assert.match(padding.css, /padding-top: 16px/)
  assert.doesNotMatch(padding.css, /padding-top: 8px/)
})
