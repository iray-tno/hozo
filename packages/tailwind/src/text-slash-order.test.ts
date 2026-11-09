import assert from 'node:assert/strict'
import test from 'node:test'
import { createCompiler, prepareFinalTailwindContext } from '@hozo/compiler'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

// #1230. `text-lg/7` was parsed as the colour `lg` at 7% opacity and drew no
// text size at all; Tailwind reads it as `text-lg` with a 28px line height.
const css = '@import "tailwindcss/theme.css" layer(theme); @tailwind utilities;'
const inputs = [
  ['text-lg/7', 'text-sm'],
  ['text-lg/7', 'leading-tight'],
  ['text-sm/6', 'text-lg/8'],
  ['text-lg/tight', 'text-sm'],
  ['text-sm', 'text-lg/[3rem]'],
  ['md:text-lg/7', 'text-sm/6'],
  ['text-xl/none', 'leading-6'],
]
const source = (classes: string) =>
  `import {Text} from '@hozo/core';export const A=()=> <Text className="${classes}">a</Text>`

async function context(names: string[]) {
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), names)
  return prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
}

test('a text size with a line height settles in Tailwind order, whichever is written first', async () => {
  const compiler = createCompiler()
  const final = await context([...new Set(inputs.flat())])
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
})

test('text-lg/7 is a size and a line height on both platforms', async () => {
  const compiler = createCompiler()
  const final = await context(['text-lg/7'])
  const web = compiler.prepareWebModule(source('text-lg/7')).emit(final)[0]!
  assert.match(web.css, /font-size: 18px;/)
  assert.doesNotMatch(web.css, /color:/)
  const native = compiler.prepareNativeModule(source('text-lg/7')).emit(final).components[0]!
  assert.match(native.styles, /fontSize: 18\b/)
  assert.match(native.styles, /lineHeight: 28\b/)
})
