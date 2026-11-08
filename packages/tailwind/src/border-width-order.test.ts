import assert from 'node:assert/strict'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { createCompiler, openCandidateCache, prepareFinalTailwindContext } from '@hozo/compiler'
import { createClassResolver } from '../../engine/src/class-resolver.ts'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

// #1230. Border widths had no ownership entry, so an input with one kept its
// authored order: `md:border-4 border-2` kept 2px at every width, and
// `border-t-4 border-2` let `border-2` overwrite the top edge.
const css = '@import "tailwindcss/theme.css" layer(theme); @tailwind utilities;'
const pairs = [
  ['md:border-4', 'border-2'],
  ['hover:border-4', 'border-2'],
  ['md:border-t-4', 'border-t-2'],
  ['md:border-x-4', 'border-x-2'],
  ['md:border-s-4', 'border-s-2'],
  ['border-t-4', 'border-2'],
  ['border-t-4', 'border-y-2'],
  ['border-s-4', 'border-x-2'],
  ['border', 'border-0'],
  ['border-2', 'border-red-500'],
]
const source = (classes: string) =>
  `import {Pressable} from '@hozo/core';export const A=()=> <Pressable className="${classes}"/>`

async function context(names: string[]) {
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), names)
  return prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
}

test('border widths settle in Tailwind order, whichever is written first', async () => {
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

test('a border style utility keeps its input in authored order', async () => {
  // `border-dashed` sets `--tw-border-style`, which every width's style
  // reads. Hozo writes the width's style as a literal `solid`, so ranking it
  // would let `md:border-2` turn a dashed border solid.
  const compiler = createCompiler()
  const final = await context(['border-dashed', 'md:border-2'])
  const css = ['border-dashed md:border-2', 'md:border-2 border-dashed'].map(
    (classes) => compiler.prepareWebModule(source(classes)).emit(final)[0]!.css,
  )
  assert.notEqual(css[0], css[1])
})

test('the dynamic Native map ranks the same border width key', async () => {
  const names = ['border-2', 'border-t-4', 'border-y-2', 'hover:border-4']
  const final = await context(names)
  const cache = openCandidateCache()
  cache.scanFile('border.ts', JSON.stringify(names.join(' ')), 0)
  const plan = cache.renderNativeModulePlan(final)
  for (const entry of plan.entries) assert.notEqual(entry.kind, 'refused', entry.candidate)
  assert.ok(plan.ordering, 'same-key width conflicts need the ranked map')
  const resolve = runInNewContext(
    `${plan.code.replace(/^import .*$/gm, '').replaceAll('export const ', 'const ')};hozoClasses`,
    { createClassResolver },
  )
  const style = (classes: string, hovered = false) =>
    Object.assign({}, ...[resolve(classes, { hovered })].flat(Infinity))
  // Tailwind emits `border-width` and `border-block-width` before
  // `border-top-width`, so the top edge is `border-t-4`'s in either order.
  for (const classes of [
    'border-2 border-t-4',
    'border-t-4 border-2',
    'border-y-2 border-t-4',
    'border-t-4 border-y-2',
  ]) {
    assert.equal(style(classes).borderTopWidth, 4, classes)
  }
  for (const classes of ['hover:border-4 border-2', 'border-2 hover:border-4']) {
    assert.equal(style(classes).borderRightWidth, 2, classes)
    assert.equal(style(classes, true).borderRightWidth, 4, classes)
  }
})
