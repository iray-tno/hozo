import assert from 'node:assert/strict'
import test from 'node:test'
import { createCompiler, prepareFinalTailwindContext } from '@hozo/compiler'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

// #1230. `overflow-auto`, `overflow-clip` and the `overflow-x-*`/`overflow-y-*`
// axes had no ownership entry, so an input with one kept its authored order
// on Web: `overflow-x-auto overflow-hidden` left the x axis hidden, where
// Tailwind emits `overflow-x` after `overflow` and keeps it `auto`.
const css = '@import "tailwindcss/theme.css" layer(theme); @tailwind utilities;'
const pairs = [
  ['overflow-hidden', 'overflow-x-auto'],
  ['overflow-hidden', 'overflow-y-scroll'],
  ['overflow-x-hidden', 'overflow-x-scroll'],
  ['overflow-y-hidden', 'overflow-y-auto'],
  ['overflow-auto', 'overflow-clip'],
  ['md:overflow-x-auto', 'overflow-x-hidden'],
  ['hover:overflow-auto', 'overflow-hidden'],
]
const source = (classes: string) =>
  `import {View} from '@hozo/core';export const A=()=> <View className="${classes}"/>`

async function context(names: string[]) {
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), names)
  return prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
}

test('overflow and its axes settle in Tailwind order, whichever is written first', async () => {
  const compiler = createCompiler()
  const final = await context([...new Set(pairs.flat())])
  for (const pair of pairs) {
    const web = [pair, pair.toReversed()].map(
      (names) => compiler.prepareWebModule(source(names.join(' '))).emit(final)[0]!,
    )
    assert.deepEqual(web[0]!.diagnostics, web[1]!.diagnostics, pair.join(' '))
    assert.equal(web[0]!.css, web[1]!.css, pair.join(' '))
    assert.equal(web[0]!.jsx, web[1]!.jsx, pair.join(' '))
    // Native has one `overflow` and no `auto` or `clip`: those are refused
    // there, whichever order they are written in.
    const native = [pair, pair.toReversed()].map(
      (names) => compiler.prepareNativeModule(source(names.join(' '))).emit(final).components[0]!,
    )
    assert.deepEqual(native[0]!.diagnostics, native[1]!.diagnostics, pair.join(' '))
    assert.equal(native[0]!.styles, native[1]!.styles, pair.join(' '))
  }
})

test('the axis comes after the shorthand in the emitted Web CSS', async () => {
  const compiler = createCompiler()
  const final = await context(['overflow-hidden', 'overflow-x-auto'])
  const out = compiler.prepareWebModule(source('overflow-x-auto overflow-hidden')).emit(final)[0]!
  const shorthand = out.css.search(/overflow:\s*hidden/)
  const axis = out.css.search(/overflow-x:\s*auto/)
  assert.ok(shorthand >= 0 && axis > shorthand, out.css)
})
