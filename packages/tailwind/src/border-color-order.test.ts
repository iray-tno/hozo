import assert from 'node:assert/strict'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { createCompiler, openCandidateCache, prepareFinalTailwindContext } from '@hozo/compiler'
import { createClassResolver } from '../../engine/src/class-resolver.ts'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

// #1230. Border colours had no ownership entry, so an input with one kept its
// authored order: `md:border-blue-500 border-red-500` kept red at every width,
// and `border-t-red-500 border-y-blue-500` painted the top blue where Tailwind
// paints it red.
const css = '@import "tailwindcss/theme.css" layer(theme); @tailwind utilities;'
const pairs = [
  ['md:border-blue-500', 'border-red-500'],
  ['active:border-blue-500', 'border-red-500'],
  ['md:border-t-blue-500', 'border-t-red-500'],
  ['md:border-x-blue-500', 'border-x-red-500'],
  ['md:border-s-blue-500', 'border-s-red-500'],
  ['border-t-red-500', 'border-blue-500'],
  ['border-t-red-500', 'border-y-blue-500'],
  ['border-s-red-500', 'border-x-blue-500'],
  ['border-l-red-500', 'border-x-blue-500'],
]
const source = (classes: string) =>
  `import {Pressable} from '@hozo/core';export const A=()=> <Pressable className="${classes}"/>`

async function context(names: string[]) {
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), names)
  return prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
}

test('border colours settle in Tailwind order, whichever is written first', async () => {
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

test('the dynamic Native map ranks the same border colour key', async () => {
  const names = [
    'border-t-red-500',
    'border-y-blue-500',
    'border-red-500',
    'active:border-blue-500',
  ]
  const final = await context(names)
  const cache = openCandidateCache()
  cache.scanFile('border.ts', JSON.stringify(names.join(' ')), 0)
  const plan = cache.renderNativeModulePlan(final)
  for (const entry of plan.entries) assert.notEqual(entry.kind, 'refused', entry.candidate)
  assert.ok(plan.ordering, 'same-key colour conflicts need the ranked map')
  const resolve = runInNewContext(
    `${plan.code.replace(/^import .*$/gm, '').replaceAll('export const ', 'const ')};hozoClasses`,
    { createClassResolver },
  )
  const style = (classes: string, pressed = false) =>
    Object.assign({}, ...[resolve(classes, { pressed })].flat(Infinity))
  const red = style('border-red-500').borderColor
  const blue = style('active:border-blue-500', true).borderColor
  assert.notEqual(red, blue)
  // Tailwind emits `border-block-color` before `border-top-color`.
  for (const classes of [
    'border-t-red-500 border-y-blue-500',
    'border-y-blue-500 border-t-red-500',
  ]) {
    assert.equal(style(classes).borderTopColor, red, classes)
    assert.equal(style(classes).borderBottomColor, blue, classes)
  }
  for (const classes of [
    'active:border-blue-500 border-red-500',
    'border-red-500 active:border-blue-500',
  ]) {
    assert.equal(style(classes).borderColor, red, classes)
    assert.equal(style(classes, true).borderColor, blue, classes)
  }
})
