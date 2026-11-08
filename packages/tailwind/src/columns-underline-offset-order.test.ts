import assert from 'node:assert/strict'
import test from 'node:test'
import { createCompiler, prepareFinalTailwindContext } from '@hozo/compiler'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

// #1230. `columns-*` and `underline-offset-*` had no ownership entry, so an
// input with one kept its authored order on Web: `columns-3 columns-2` took
// `2` where Tailwind's alphanumeric tiebreak puts `columns-3` last.
const css = '@import "tailwindcss/theme.css" layer(theme); @tailwind utilities;'
const pairs = [
  ['columns-2', 'columns-3'],
  ['columns-auto', 'columns-xs'],
  ['md:columns-1', 'columns-4'],
  ['underline-offset-2', 'underline-offset-4'],
  ['underline-offset-auto', 'underline-offset-1'],
  ['hover:underline-offset-8', 'underline-offset-2'],
]
const source = (classes: string) =>
  `import {Text} from '@hozo/core';export const A=()=> <Text className="${classes}">a</Text>`

async function context(names: string[]) {
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), names)
  return prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
}

test('columns and underline offsets settle in Tailwind order, whichever is written first', async () => {
  const compiler = createCompiler()
  const final = await context([...new Set(pairs.flat())])
  for (const pair of pairs) {
    const web = [pair, pair.toReversed()].map(
      (names) => compiler.prepareWebModule(source(names.join(' '))).emit(final)[0]!,
    )
    assert.deepEqual(web[0]!.diagnostics, web[1]!.diagnostics, pair.join(' '))
    assert.equal(web[0]!.css, web[1]!.css, pair.join(' '))
    assert.equal(web[0]!.jsx, web[1]!.jsx, pair.join(' '))
    // Both are refused on Native, whichever order they are written in.
    const native = [pair, pair.toReversed()].map(
      (names) => compiler.prepareNativeModule(source(names.join(' '))).emit(final).components[0]!,
    )
    assert.deepEqual(native[0]!.diagnostics, native[1]!.diagnostics, pair.join(' '))
    assert.equal(native[0]!.styles, native[1]!.styles, pair.join(' '))
  }
})
