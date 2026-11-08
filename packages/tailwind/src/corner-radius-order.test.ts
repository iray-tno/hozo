import assert from 'node:assert/strict'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { createCompiler, openCandidateCache, prepareFinalTailwindContext } from '@hozo/compiler'
import { createClassResolver } from '../../engine/src/class-resolver.ts'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

// #1230. Per-corner radii were outside the ordering domain, so an input with
// one kept its authored order: `md:rounded-t-lg rounded-t-sm` kept the small
// corners at every width, and `rounded-tl-none rounded-l-lg` rounded the
// corner Tailwind squares.
const css = '@import "tailwindcss/theme.css" layer(theme); @tailwind utilities;'
const pairs = [
  ['md:rounded-t-lg', 'rounded-t-sm'],
  ['md:rounded-tl-lg', 'rounded-tl-sm'],
  ['md:rounded-s-lg', 'rounded-s-sm'],
  ['md:rounded-ee-lg', 'rounded-ee-sm'],
  ['active:rounded-b-lg', 'rounded-b-none'],
  ['rounded-tl-none', 'rounded-l-lg'],
  ['rounded-ss-none', 'rounded-s-lg'],
  ['rounded-t-none', 'rounded-lg'],
  ['rounded-e-none', 'rounded-lg'],
]
const source = (classes: string) =>
  `import {Pressable} from '@hozo/core';export const A=()=> <Pressable className="${classes}"/>`

async function context(names: string[]) {
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), names)
  return prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
}

test('corner radii settle in Tailwind order, whichever is written first', async () => {
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

test('the dynamic Native map ranks the same corner key', async () => {
  const names = ['rounded-tl-none', 'rounded-l-lg', 'rounded-ss-none', 'rounded-s-lg']
  const final = await context(names)
  const cache = openCandidateCache()
  cache.scanFile('corners.ts', JSON.stringify(names.join(' ')), 0)
  const plan = cache.renderNativeModulePlan(final)
  for (const entry of plan.entries) assert.notEqual(entry.kind, 'refused', entry.candidate)
  assert.ok(plan.ordering, 'same-key corner conflicts need the ranked map')
  const resolve = runInNewContext(
    `${plan.code.replace(/^import .*$/gm, '').replaceAll('export const ', 'const ')};hozoClasses`,
    { createClassResolver },
  )
  const style = (classes: string) => Object.assign({}, ...[resolve(classes)].flat(Infinity))
  // Tailwind emits the single corner after the side, so the corner wins.
  for (const classes of ['rounded-tl-none rounded-l-lg', 'rounded-l-lg rounded-tl-none']) {
    assert.equal(style(classes).borderTopLeftRadius, 0, classes)
    assert.ok(style(classes).borderBottomLeftRadius > 0, classes)
  }
  for (const classes of ['rounded-ss-none rounded-s-lg', 'rounded-s-lg rounded-ss-none']) {
    assert.equal(style(classes).borderStartStartRadius, 0, classes)
    assert.ok(style(classes).borderEndStartRadius > 0, classes)
  }
})
