import assert from 'node:assert/strict'
import test from 'node:test'
import { createCompiler, openCandidateCache, prepareFinalTailwindContext } from '@hozo/compiler'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

// #1230. `group-`, `peer-`, `in-` and `has-` were barriers, so an input with
// one kept its authored order: `hover:p-8 group-hover:p-4` let the group win
// where Tailwind's later `hover:` does, and `in-focus:p-4 p-2` never showed
// the focused padding.
const css = '@import "tailwindcss/theme.css" layer(theme); @tailwind utilities;'
const pairs = [
  ['group-hover:p-4', 'p-2'],
  ['group-active:p-4', 'p-2'],
  ['group-aria-checked:p-4', 'p-2'],
  ['group-data-[state=open]:p-4', 'p-2'],
  ['group-first:p-4', 'p-2'],
  ['peer-checked:p-4', 'p-2'],
  ['in-focus:p-4', 'p-2'],
  ['has-checked:p-4', 'p-2'],
  ['group-hover:p-4', 'hover:p-8'],
  ['peer-checked:p-4', 'group-hover:p-8'],
  ['in-focus:p-4', 'md:p-8'],
]
const source = (classes: string) =>
  `import {Pressable} from '@hozo/core';export const A=()=> <Pressable className="${classes}"/>`

async function context(names: string[]) {
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), names)
  return prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
}

test('relations settle in Tailwind order, whichever is written first', async () => {
  const compiler = createCompiler()
  const final = await context([...new Set(pairs.flat())])
  for (const pair of pairs) {
    const web = [pair, pair.toReversed()].map(
      (names) => compiler.prepareWebModule(source(names.join(' '))).emit(final)[0]!,
    )
    assert.deepEqual(web[0]!.diagnostics, [], pair.join(' '))
    assert.equal(web[0]!.css, web[1]!.css, pair.join(' '))
    const native = [pair, pair.toReversed()].map(
      (names) => compiler.prepareNativeModule(source(names.join(' '))).emit(final).components[0]!,
    )
    assert.deepEqual(native[0]!.diagnostics, native[1]!.diagnostics, pair.join(' '))
    if (native[0]!.diagnostics.length === 0) {
      assert.equal(native[0]!.styles, native[1]!.styles, pair.join(' '))
      assert.equal(native[0]!.jsx, native[1]!.jsx, pair.join(' '))
    }
  }
})

test('the dynamic Native map generates no relation candidate to rank', async () => {
  const names = [...new Set(pairs.flat())]
  const final = await context(names)
  const cache = openCandidateCache()
  cache.scanFile('relations.ts', JSON.stringify(names.join(' ')), 0)
  const plan = cache.renderNativeModulePlan(final)
  // The generated map has no relation candidate, so ranking the static path
  // opens no static/dynamic disagreement. When it starts generating them,
  // this fails and they must be ranked by the same boundary.
  for (const entry of plan.entries) {
    if (!/^(group|peer|in|has)-/.test(entry.candidate)) continue
    assert.equal(entry.kind, 'refused', entry.candidate)
    assert.equal(entry.reason, 'unsupported-condition-or-property', entry.candidate)
  }
})
