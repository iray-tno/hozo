import assert from 'node:assert/strict'
import test from 'node:test'
import { createCompiler, prepareFinalTailwindContext } from '@hozo/compiler'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

// #1230. Ratio leading (`leading-tight`) and em tracking (`tracking-wide`)
// had no ownership entry, so an input with one kept its authored order:
// `leading-tight leading-loose` took the loose line where Tailwind keeps
// `leading-tight`. Native turns the winner into pixels against the font size
// after ordering, as it did before.
const css = '@import "tailwindcss/theme.css" layer(theme); @tailwind utilities;'
const inputs = [
  ['text-lg', 'leading-tight', 'leading-loose'],
  ['text-lg', 'leading-tight', 'leading-6'],
  ['text-lg', 'leading-tight', 'leading-normal'],
  ['text-lg', 'leading-none', 'leading-snug'],
  ['text-lg', 'tracking-wide', 'tracking-tight'],
  ['text-lg', 'tracking-wide', 'tracking-[2px]'],
  ['text-lg', 'md:leading-loose', 'leading-tight'],
  ['text-sm', 'md:text-xl', 'leading-tight'],
]
const source = (classes: string) =>
  `import {Text} from '@hozo/core';export const A=()=> <Text className="${classes}">a</Text>`

async function context(names: string[]) {
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), names)
  return prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
}

test('relative leading and tracking settle in Tailwind order, whichever is written first', async () => {
  const compiler = createCompiler()
  const final = await context([...new Set(inputs.flat())])
  for (const input of inputs) {
    const web = [input, input.toReversed()].map(
      (names) => compiler.prepareWebModule(source(names.join(' '))).emit(final)[0]!,
    )
    assert.deepEqual(web[0]!.diagnostics, web[1]!.diagnostics, input.join(' '))
    assert.equal(web[0]!.css, web[1]!.css, input.join(' '))
    assert.equal(web[0]!.jsx, web[1]!.jsx, input.join(' '))
    const native = [input, input.toReversed()].map(
      (names) => compiler.prepareNativeModule(source(names.join(' '))).emit(final).components[0]!,
    )
    assert.deepEqual(native[0]!.diagnostics, native[1]!.diagnostics, input.join(' '))
    assert.equal(native[0]!.styles, native[1]!.styles, input.join(' '))
    assert.equal(native[0]!.jsx, native[1]!.jsx, input.join(' '))
  }
})

test('Native sizes the leading Web keeps against the font size', async () => {
  const compiler = createCompiler()
  const names = ['text-lg', 'leading-tight', 'leading-loose']
  const final = await context(names)
  for (const classes of [
    'text-lg leading-tight leading-loose',
    'text-lg leading-loose leading-tight',
  ]) {
    const web = compiler.prepareWebModule(source(classes)).emit(final)[0]!
    const ratio = Number(/line-height: ([\d.]+);/.exec(web.css)?.[1])
    assert.ok(ratio > 0, web.css)
    const native = compiler.prepareNativeModule(source(classes)).emit(final).components[0]!
    const fontSize = Number(/fontSize: ([\d.]+)/.exec(native.styles)?.[1])
    const lineHeight = Number(/lineHeight: ([\d.]+)/.exec(native.styles)?.[1])
    assert.ok(fontSize > 0, native.styles)
    assert.equal(lineHeight, fontSize * ratio, classes)
  }
})
