import assert from 'node:assert/strict'
import test from 'node:test'
import { createCompiler, prepareFinalTailwindContext } from '@hozo/compiler'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

// #1230. Grid display, tracks and placement, and `fixed`/`sticky`, had no
// ownership entry, so any input with one kept its authored order: `grid`,
// `fixed` and `row-span-2` held class lists of this repository on that path
// (docs/measurements/tailwind-order-coverage.md).
const css = '@import "tailwindcss/theme.css" layer(theme); @tailwind utilities;'
const parents = [
  ['grid', 'flex'],
  ['hidden', 'grid'],
  ['inline-block', 'block'],
  ['grid', 'grid-cols-3', 'grid-cols-2'],
  ['grid', 'grid-cols-2', 'grid-rows-3', 'grid-rows-2'],
  ['fixed', 'absolute'],
  ['sticky', 'relative'],
  ['md:grid', 'flex'],
  ['p-2', 'p-4', 'grid'],
]
const items = [
  ['col-span-2', 'col-span-1'],
  ['col-start-2', 'col-span-2'],
  ['col-end-3', 'col-start-1', 'col-start-2'],
  ['row-span-2', 'row-span-1'],
  ['row-start-2', 'row-span-2'],
  ['p-2', 'p-4', 'row-span-2'],
]
const source = (parent: string, item = 'p-1') =>
  `import {View} from '@hozo/core';export const A=()=> <View className="${parent}"><View className="${item}"/><View/><View/></View>`

test('grid, display keywords and fixed/sticky settle in Tailwind order, whichever is written first', async () => {
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), [
    ...new Set([...parents, ...items, ['grid', 'grid-cols-3', 'p-1']].flat()),
  ])
  const final = prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
  const compiler = createCompiler()
  const cases = [
    ...parents.map((input) => [input, (names: string[]) => source(names.join(' '))] as const),
    ...items.map(
      (input) => [input, (names: string[]) => source('grid grid-cols-3', names.join(' '))] as const,
    ),
  ]
  for (const [input, make] of cases) {
    const web = [input, input.toReversed()].map(
      (names) => compiler.prepareWebModule(make(names)).emit(final)[0]!,
    )
    assert.deepEqual(web[0]!.diagnostics, web[1]!.diagnostics, input.join(' '))
    assert.equal(web[0]!.css, web[1]!.css, input.join(' '))
    const native = [input, input.toReversed()].map(
      (names) => compiler.prepareNativeModule(make(names)).emit(final).components[0]!,
    )
    assert.deepEqual(native[0]!.diagnostics, native[1]!.diagnostics, input.join(' '))
    assert.equal(native[0]!.styles, native[1]!.styles, input.join(' '))
    assert.equal(native[0]!.jsx, native[1]!.jsx, input.join(' '))
  }
  // Tailwind's winners: `grid` after `flex`, `grid-cols-3` after
  // `grid-cols-2`, whichever was written last.
  const web = compiler.prepareWebModule(source('grid grid-cols-3 grid-cols-2 flex')).emit(final)[0]!
  assert.match(web.css, /\.hozo-0 \{\n {2}display: grid;/)
  assert.match(web.css, /grid-template-columns: repeat\(3/)
  // Native's grid wrapper sees the ranked winner too: three columns. (The
  // losing `flex` keeps its Native `display` key, since the grid wrapper
  // writes none; that was so in authored order too.)
  const native = compiler
    .prepareNativeModule(source('grid-cols-3 grid-cols-2 flex grid'))
    .emit(final).components[0]!
  assert.equal(
    native.jsx,
    compiler.prepareNativeModule(source('flex grid grid-cols-3')).emit(final).components[0]!.jsx,
  )
  assert.match(native.jsx, /tracks=\{\[\{ kind: 'fr', value: 1 \}, \{ kind: 'fr', value: 1 \}, \{/)
  // A grid write no longer holds a padding conflict on the old path.
  const padding = compiler.prepareWebModule(source('p-4 p-2 grid')).emit(final)[0]!
  assert.match(padding.css, /padding-top: 16px/)
  assert.doesNotMatch(padding.css, /padding-top: 8px/)
})
