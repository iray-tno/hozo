import assert from 'node:assert/strict'
import test from 'node:test'
import { createCompiler, prepareFinalTailwindContext } from '@hozo/compiler'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

// #1230. The 3D rotations and skews had no ownership entry, so an input with
// one kept its authored order: `skew-x-12 skew-x-6` took 6deg where
// Tailwind emits `skew-x-12` last.
const css = '@import "tailwindcss/theme.css" layer(theme); @tailwind utilities;'
const pairs = [
  ['skew-x-6', 'skew-x-12'],
  ['skew-y-3', 'skew-y-6'],
  ['skew-6', 'skew-x-12'],
  ['rotate-x-45', 'rotate-x-12'],
  ['rotate-y-12', 'rotate-y-45'],
  ['md:skew-x-12', 'skew-x-3'],
  ['rotate-x-45', 'skew-y-6'],
  ['rotate-45', 'skew-x-12'],
]
const source = (classes: string) =>
  `import {View} from '@hozo/core';export const A=()=> <View className="${classes}"/>`

async function context(names: string[]) {
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), names)
  return prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
}

test('3D rotations and skews settle in Tailwind order, whichever is written first', async () => {
  const compiler = createCompiler()
  const final = await context([...new Set(pairs.flat())])
  for (const pair of pairs) {
    const web = [pair, pair.toReversed()].map(
      (names) => compiler.prepareWebModule(source(names.join(' '))).emit(final)[0]!,
    )
    assert.deepEqual(web[0]!.diagnostics, web[1]!.diagnostics, pair.join(' '))
    assert.equal(web[0]!.css, web[1]!.css, pair.join(' '))
    assert.equal(web[0]!.jsx, web[1]!.jsx, pair.join(' '))
    const native = [pair, pair.toReversed()].map(
      (names) => compiler.prepareNativeModule(source(names.join(' '))).emit(final).components[0]!,
    )
    assert.deepEqual(native[0]!.diagnostics, native[1]!.diagnostics, pair.join(' '))
    assert.equal(native[0]!.styles, native[1]!.styles, pair.join(' '))
    assert.equal(native[0]!.jsx, native[1]!.jsx, pair.join(' '))
  }
})

test('Native keeps the skew Tailwind keeps', async () => {
  const compiler = createCompiler()
  const final = await context(['skew-x-6', 'skew-x-12'])
  for (const classes of ['skew-x-6 skew-x-12', 'skew-x-12 skew-x-6']) {
    const out = compiler.prepareNativeModule(source(classes)).emit(final).components[0]!
    assert.match(out.styles, /skewX: '12deg'/, classes)
    assert.doesNotMatch(out.styles, /'6deg'/, classes)
  }
})
