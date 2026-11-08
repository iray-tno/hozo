import assert from 'node:assert/strict'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { createCompiler, openCandidateCache, prepareFinalTailwindContext } from '@hozo/compiler'
import { createClassResolver } from '../../engine/src/class-resolver.ts'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

// #1230. The `flex` shorthand had no ownership entry, so an input with one
// kept its authored order: `md:flex-none flex-1` kept `flex-1` at every
// width, and `grow-0 flex-auto` let `flex-auto` grow where Tailwind's later
// `flex-grow` keeps it at 0.
const css = '@import "tailwindcss/theme.css" layer(theme); @tailwind utilities;'
const pairs = [
  ['md:flex-none', 'flex-1'],
  ['hover:flex-auto', 'flex-none'],
  ['md:flex-1', 'flex-initial'],
  ['flex-auto', 'flex-none'],
  ['flex-1', 'flex-auto'],
  ['grow-0', 'flex-auto'],
  ['shrink-0', 'flex-initial'],
  ['basis-4', 'flex-1'],
  ['grow', 'flex-none'],
]
const source = (classes: string) =>
  `import {Pressable} from '@hozo/core';export const A=()=> <Pressable className="${classes}"/>`

async function context(names: string[]) {
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), names)
  return prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
}

test('the flex shorthand settles in Tailwind order, whichever is written first', async () => {
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

test('the dynamic Native map ranks the shorthand against grow and shrink', async () => {
  const names = ['flex-auto', 'grow-0', 'flex-none', 'hover:flex-auto']
  const final = await context(names)
  const cache = openCandidateCache()
  cache.scanFile('flex.ts', JSON.stringify(names.join(' ')), 0)
  const plan = cache.renderNativeModulePlan(final)
  for (const entry of plan.entries) assert.notEqual(entry.kind, 'refused', entry.candidate)
  assert.ok(plan.ordering, 'same-key flex conflicts need the ranked map')
  const resolve = runInNewContext(
    `${plan.code.replace(/^import .*$/gm, '').replaceAll('export const ', 'const ')};hozoClasses`,
    { createClassResolver },
  )
  const style = (classes: string, hovered = false) =>
    Object.assign({}, ...[resolve(classes, { hovered })].flat(Infinity))
  // Tailwind emits `flex-grow` after `flex`, so `grow-0` wins in either order.
  for (const classes of ['flex-auto grow-0', 'grow-0 flex-auto']) {
    assert.equal(style(classes).flexGrow, 0, classes)
    assert.equal(style(classes).flexShrink, 1, classes)
  }
  for (const classes of ['hover:flex-auto flex-none', 'flex-none hover:flex-auto']) {
    assert.equal(style(classes).flexGrow, 0, classes)
    assert.equal(style(classes, true).flexGrow, 1, classes)
  }
})
