import assert from 'node:assert/strict'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { createCompiler, openCandidateCache, prepareFinalTailwindContext } from '@hozo/compiler'
import { createClassResolver } from '../../engine/src/class-resolver.ts'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

// #1230. Outline widths, colours and offsets had no ownership entry, so an
// input with one kept its authored order: `focus:outline-4 outline-2` kept
// 2px when focused, as `focus:outline-blue-500 outline-red-500` kept red.
const css = '@import "tailwindcss/theme.css" layer(theme); @tailwind utilities;'
const pairs = [
  ['focus:outline-4', 'outline-2'],
  ['md:outline-2', 'outline'],
  ['focus:outline-blue-500', 'outline-red-500'],
  ['focus-visible:outline-offset-4', 'outline-offset-2'],
  ['md:-outline-offset-2', 'outline-offset-2'],
  ['outline', 'outline-2'],
  ['outline-2', 'outline-red-500'],
]
const source = (classes: string) =>
  `import {Pressable} from '@hozo/core';export const A=()=> <Pressable className="${classes}"/>`

async function context(names: string[]) {
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), names)
  return prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
}

test('outline writes settle in Tailwind order, whichever is written first', async () => {
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

test('outline styles rank, `outline-none` and `outline-hidden` included', async () => {
  // `outline-dashed` sets `--tw-outline-style`, which every outline width
  // reads; a width's own style is `BorderStyle::Default`, at zero
  // specificity, so `focus:outline-2` keeps it dashed in either order.
  // `outline-none`/`outline-hidden` are written styles too (Native's
  // `outlineWidth: 0` stand-in is a known gap, not an ordering one).
  const compiler = createCompiler()
  for (const style of ['outline-dashed', 'outline-none', 'outline-hidden']) {
    const final = await context([style, 'focus:outline-2'])
    const css = [`${style} focus:outline-2`, `focus:outline-2 ${style}`].map(
      (classes) => compiler.prepareWebModule(source(classes)).emit(final)[0]!.css,
    )
    assert.equal(css[0], css[1], style)
  }
})

test('the dynamic Native map ranks the same outline key', async () => {
  const names = ['outline-2', 'focus:outline-4', 'outline-red-500', 'focus:outline-blue-500']
  const final = await context(names)
  const cache = openCandidateCache()
  cache.scanFile('outline.ts', JSON.stringify(names.join(' ')), 0)
  const plan = cache.renderNativeModulePlan(final)
  for (const entry of plan.entries) assert.notEqual(entry.kind, 'refused', entry.candidate)
  assert.ok(plan.ordering, 'same-key outline conflicts need the ranked map')
  const resolve = runInNewContext(
    `${plan.code.replace(/^import .*$/gm, '').replaceAll('export const ', 'const ')};hozoClasses`,
    { createClassResolver },
  )
  const style = (classes: string, focused = false) =>
    Object.assign({}, ...[resolve(classes, { focused })].flat(Infinity))
  const red = style('outline-red-500').outlineColor
  const blue = style('focus:outline-blue-500', true).outlineColor
  assert.notEqual(red, blue)
  for (const classes of [
    'focus:outline-4 outline-2 focus:outline-blue-500 outline-red-500',
    'outline-red-500 outline-2 focus:outline-blue-500 focus:outline-4',
  ]) {
    assert.equal(style(classes).outlineWidth, 2, classes)
    assert.equal(style(classes).outlineColor, red, classes)
    assert.equal(style(classes, true).outlineWidth, 4, classes)
    assert.equal(style(classes, true).outlineColor, blue, classes)
  }
})
