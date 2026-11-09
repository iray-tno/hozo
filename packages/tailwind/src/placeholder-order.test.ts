import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createCompiler,
  openCandidateCache,
  prepareAuthoredTailwindContext,
  prepareFinalTailwindContext,
} from '@hozo/compiler'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

// #1230. `placeholder:` was an unassessed selector, so an input with one
// kept its authored order; `placeholder:text-hozo-text-subtle` held four
// class lists of this repository on that path
// (docs/measurements/tailwind-order-coverage.md).
const css = '@import "tailwindcss/theme.css" layer(theme); @tailwind utilities;'
const inputs = [
  ['placeholder:text-red-500', 'placeholder:text-blue-500'],
  ['placeholder:text-red-500', 'p-4', 'p-2'],
  ['placeholder:text-red-500', 'text-blue-500', 'text-green-500'],
  ['dark:placeholder:text-red-500', 'placeholder:text-blue-500', 'placeholder:text-green-500'],
  ['focus:p-2', 'placeholder:text-red-500', 'focus:p-4'],
]
const source = (classes: string) =>
  `import {TextInput} from '@hozo/core';export const A=()=> <TextInput placeholder="x" className="${classes}"/>`

test('placeholder colours settle in Tailwind order, whichever is written first', async () => {
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
    const old = [input, input.toReversed()].map(
      (names) =>
        compiler.prepareNativeModule(source(names.join(' '))).emit(authored).components[0]!.jsx +
        compiler.prepareWebModule(source(names.join(' '))).emit(authored)[0]!.css,
    )
    if (old[0] !== old[1]) differs++
  }
  assert.ok(differs >= 3, `authored order differed in ${differs}`)
  // Native's `placeholderTextColor` takes Tailwind's winner, blue over red
  // (`text-blue-500` sorts before `text-red-500`, so red is later).
  const native = compiler
    .prepareNativeModule(source('placeholder:text-red-500 placeholder:text-blue-500'))
    .emit(final).components[0]!
  assert.equal(
    native.jsx,
    compiler.prepareNativeModule(source('placeholder:text-red-500')).emit(final).components[0]!.jsx,
  )
  const cache = openCandidateCache()
  cache.scanFile('placeholder.ts', JSON.stringify(names.join(' ')), 0)
  for (const entry of cache.renderNativeModulePlan(final).entries)
    if (entry.candidate.includes('placeholder:'))
      assert.ok(
        entry.groups.every((group) => group.orderable),
        entry.candidate,
      )
  // A placeholder colour no longer holds a padding conflict on the old path.
  const padding = compiler
    .prepareWebModule(source('p-4 p-2 placeholder:text-red-500'))
    .emit(final)[0]!
  assert.match(padding.css, /padding-top: 16px/)
  assert.doesNotMatch(padding.css, /padding-top: 8px/)
})

test('resize utilities settle in Tailwind order too', async () => {
  const inputs = [
    ['resize-y', 'resize-none'],
    ['resize', 'resize-x', 'p-4', 'p-2'],
  ]
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), [
    ...new Set(inputs.flat()),
  ])
  const final = prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
  const compiler = createCompiler()
  for (const input of inputs) {
    const web = [input, input.toReversed()].map(
      (names) => compiler.prepareWebModule(source(names.join(' '))).emit(final)[0]!,
    )
    assert.equal(web[0]!.css, web[1]!.css, input.join(' '))
    const native = [input, input.toReversed()].map(
      (names) => compiler.prepareNativeModule(source(names.join(' '))).emit(final).components[0]!,
    )
    assert.deepEqual(native[0]!.diagnostics, native[1]!.diagnostics, input.join(' '))
    assert.equal(native[0]!.styles, native[1]!.styles, input.join(' '))
  }
  // `resize-y` sorts after `resize-none`, as in Tailwind.
  const web = compiler.prepareWebModule(source('resize-y resize-none')).emit(final)[0]!
  assert.match(web.css, /resize: vertical/)
  assert.doesNotMatch(web.css, /resize: none/)
})
