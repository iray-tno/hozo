import assert from 'node:assert/strict'
import test from 'node:test'
import { createCompiler, prepareFinalTailwindContext } from '@hozo/compiler'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

// #1230. Only absolute text sizes had an ownership entry, so an input with
// `text-[2em]` kept its authored order: `text-[2em] text-sm` drew 14px where
// Tailwind emits the arbitrary size last and draws 2em.
const css = '@import "tailwindcss/theme.css" layer(theme); @tailwind utilities;'
const inputs = [
  ['text-[2em]', 'text-sm'],
  ['text-[2em]', 'text-[3em]'],
  ['md:text-[2em]', 'text-sm'],
  ['text-[1.5rem]', 'text-sm'],
]
const source = (classes: string) =>
  `import {Text} from '@hozo/core';export const A=()=> <Text className="${classes}">a</Text>`

test('relative text sizes settle in Tailwind order, whichever is written first', async () => {
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
  }
  const winner = compiler.prepareWebModule(source('text-[2em] text-sm')).emit(final)[0]!
  assert.match(winner.css, /font-size: 2em;/)
  assert.ok(winner.css.indexOf('font-size: 2em') > winner.css.indexOf('font-size: 14px'))
})
