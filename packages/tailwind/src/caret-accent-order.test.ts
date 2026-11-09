import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createCompiler,
  prepareAuthoredTailwindContext,
  prepareFinalTailwindContext,
} from '@hozo/compiler'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

// #1230. `caret-*` and `accent-*` had no ownership entry, so an input with
// one kept its authored order (`accent-emerald-600` held a class list of
// this repository on that path). Native's `cursorColor` also took the
// *first* caret colour, and applied a `focus:` or `dark:` one
// unconditionally.
const css = '@import "tailwindcss/theme.css" layer(theme); @tailwind utilities;'
const inputs = [
  ['caret-red-500', 'caret-blue-500'],
  ['accent-red-500', 'accent-blue-500'],
  ['caret-red-500', 'p-4', 'p-2'],
  ['dark:caret-red-500', 'caret-blue-500', 'caret-green-500'],
  ['accent-emerald-600', 'mt-4', 'mt-2'],
]
const source = (classes: string) =>
  `import {TextInput} from '@hozo/core';export const A=()=> <TextInput accessibilityLabel="x" className="${classes}"/>`

test('caret and accent colours settle in Tailwind order, and Native takes the winning caret', async () => {
  const names = [...new Set([...inputs.flat(), 'focus:caret-red-500'])]
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
    assert.deepEqual(both[0]!.diagnostics, both[1]!.diagnostics, input.join(' '))
    assert.equal(both[0]!.styles, both[1]!.styles, input.join(' '))
    assert.equal(both[0]!.jsx, both[1]!.jsx, input.join(' '))
    const old = [input, input.toReversed()].map(
      (names) =>
        native(names.join(' '), authored).jsx +
        compiler.prepareWebModule(source(names.join(' '))).emit(authored)[0]!.css,
    )
    if (old[0] !== old[1]) differs++
  }
  assert.ok(differs >= 3, `authored order differed in ${differs}`)
  // Tailwind's winner is `caret-red-500` (after `caret-blue-500`), whichever
  // is written last.
  assert.match(native('caret-red-500 caret-blue-500').jsx, /cursorColor=\{'#fb2c36'\}/)
  // `dark:` is the dark scheme's colour, over the light one.
  assert.match(
    native('dark:caret-red-500 caret-blue-500').jsx,
    /cursorColor=\{__hozoDark \? '#fb2c36' : '#2b7fff'\}/,
  )
  // A `focus:` caret is not wired: diagnosed, never applied to every state.
  const focus = native('focus:caret-red-500 caret-blue-500')
  assert.match(focus.jsx, /cursorColor=\{'#2b7fff'\}/)
  assert.ok(
    focus.diagnostics.some((entry) => /conditional caret colours/.test(entry.message)),
    JSON.stringify(focus.diagnostics),
  )
  // A caret no longer holds a padding conflict on the old path.
  const padding = compiler.prepareWebModule(source('p-4 p-2 caret-red-500')).emit(final)[0]!
  assert.match(padding.css, /padding-top: 16px/)
  assert.doesNotMatch(padding.css, /padding-top: 8px/)
})
