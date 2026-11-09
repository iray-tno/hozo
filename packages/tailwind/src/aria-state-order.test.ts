import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createCompiler,
  openCandidateCache,
  prepareAuthoredTailwindContext,
  prepareFinalTailwindContext,
} from '@hozo/compiler'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

// #1230. `aria-pressed:`, `aria-hidden:`, `aria-readonly:` and
// `aria-required:` were unassessed, so an input with one kept its authored
// order; `aria-pressed:bg-hozo-accent-subtle` held four class lists of
// this repository on that path (docs/measurements/tailwind-order-coverage.md).
const css = '@import "tailwindcss/theme.css" layer(theme); @tailwind utilities;'
const states = ['pressed', 'hidden', 'readonly', 'required']
const inputs = states.flatMap((state) => [
  [`aria-${state}:p-4`, `aria-${state}:p-2`],
  [`aria-${state}:p-2`, 'p-4', 'p-2'],
  [`aria-${state}:p-2`, 'hover:p-4'],
  [`not-aria-${state}:p-2`, `aria-${state}:p-4`, 'p-1'],
])
const source = (classes: string) =>
  `import {Pressable} from '@hozo/core';export const A=({state})=> <Pressable accessibilityState={state} className="${classes}"/>`

test('every boolean ARIA state Tailwind names settles in its order, whichever is written first', async () => {
  const names = [...new Set(inputs.flat())]
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
    // Negative control: authored order is order-sensitive for these inputs.
    const old = [input, input.toReversed()].map(
      (names) => compiler.prepareWebModule(source(names.join(' '))).emit(authored)[0]!.css,
    )
    if (old[0] !== old[1]) differs++
  }
  assert.ok(differs >= states.length, `authored order differed in ${differs}`)
  // The generated Native map ranks them too.
  const cache = openCandidateCache()
  cache.scanFile('aria.ts', JSON.stringify(names.join(' ')), 0)
  for (const entry of cache.renderNativeModulePlan(final).entries)
    assert.ok(
      entry.groups.every((group) => group.orderable),
      entry.candidate,
    )
  // An ARIA state no longer holds a padding conflict on the old path.
  const padding = compiler.prepareWebModule(source('p-4 p-2 aria-pressed:p-2')).emit(final)[0]!
  assert.match(padding.css, /\.hozo-0 \{\n {2}padding-top: 16px;/)
  assert.match(padding.css, /\.hozo-0\[aria-pressed="true"\] \{\n {2}padding-top: 8px;/)
})
