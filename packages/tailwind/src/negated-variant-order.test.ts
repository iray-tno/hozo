import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createCompiler,
  prepareAuthoredTailwindContext,
  prepareFinalTailwindContext,
} from '@hozo/compiler'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

// #1230, domain 5 of the inventory (docs/measurements/tailwind-order-inventory.md):
// the `not-*` forms of states, selectors and queries were unassessed, so an
// input with one kept its authored order. `not-hover:`, which Tailwind
// writes as two branches, is read through its selector branch.
const css = '@import "tailwindcss/theme.css" layer(theme); @tailwind utilities;'
const source = (classes: string) =>
  `import {Pressable} from '@hozo/core';export const A=({off})=> <Pressable disabled={off} accessibilityLabel="x" className="${classes}"/>`
const inputs = [
  ['not-focus:p-4', 'not-focus:p-2'],
  ['not-focus:p-2', 'p-4', 'focus:p-8'],
  ['not-active:p-2', 'active:p-4', 'p-1'],
  ['not-disabled:p-2', 'disabled:p-4', 'p-1'],
  ['not-focus-visible:p-2', 'p-4'],
  ['not-sm:p-2', 'sm:p-4', 'p-1'],
  ['not-dark:p-2', 'dark:p-4', 'p-1'],
  ['not-motion-safe:p-2', 'p-4'],
  ['not-portrait:p-2', 'p-4', 'p-1'],
  ['not-empty:p-2', 'p-4'],
  ['not-ltr:p-2', 'p-4'],
  ['not-enabled:p-2', 'p-4'],
]

test('negated states, selectors and queries settle in Tailwind order, whichever is written first', async () => {
  const names = [...new Set([...inputs.flat(), 'not-hover:p-2'])]
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
  assert.ok(differs >= 8, `authored order differed in ${differs}`)
  // `not-hover:` is two branches in Tailwind at one place in the order; both
  // now follow the unprefixed rule, so a device that cannot hover gets the
  // `not-hover:` padding, as in Tailwind.
  const hoverless = ['not-hover:p-2 p-4', 'p-4 not-hover:p-2'].map(
    (classes) => compiler.prepareWebModule(source(classes)).emit(final)[0]!.css,
  )
  assert.equal(hoverless[0], hoverless[1])
  assert.ok(
    hoverless[0]!.indexOf('padding-top: 16px') < hoverless[0]!.indexOf('@media not (hover: hover)'),
    hoverless[0],
  )
})
