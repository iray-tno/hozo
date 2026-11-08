import assert from 'node:assert/strict'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { createCompiler, openCandidateCache, prepareFinalTailwindContext } from '@hozo/compiler'
import { createClassResolver } from '../../engine/src/class-resolver.ts'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

// #1230. These had no ownership mapping, so an input with one kept its
// authored order: `md:block hidden` hid the element at every width.
const css = '@import "tailwindcss/theme.css" layer(theme); @tailwind utilities;'
const pairs = [
  ['md:block', 'hidden'],
  ['md:top-4', 'top-2'],
  ['md:right-4', 'right-2'],
  ['md:bottom-4', 'bottom-2'],
  ['md:left-4', 'left-2'],
  ['md:aspect-video', 'aspect-square'],
  ['md:order-1', 'order-2'],
  ['md:rounded-lg', 'rounded-sm'],
  ['hover:rounded-full', 'rounded-none'],
]
const source = (classes: string) =>
  `import {View} from '@hozo/core';export const A=()=> <View className="${classes}"/>`

test('direct properties settle in Tailwind order, whichever is written first', async () => {
  const compiler = createCompiler()
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), [...new Set(pairs.flat())])
  const final = prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
  for (const pair of pairs) {
    const web = [pair, pair.toReversed()].map(
      (names) => compiler.prepareWebModule(source(names.join(' '))).emit(final)[0]!,
    )
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

test('the dynamic Native map lets hidden win over block and flex in either order, as Tailwind does', async () => {
  const names = ['hidden', 'flex', 'block']
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), names)
  const final = prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
  const cache = openCandidateCache()
  cache.scanFile('display.ts', JSON.stringify(names.join(' ')), 0)
  const plan = cache.renderNativeModulePlan(final)
  assert.ok(plan.ordering, 'display conflicts need the ranked map')
  const resolve = runInNewContext(
    `${plan.code.replace(/^import .*$/gm, '').replaceAll('export const ', 'const ')};hozoClasses`,
    { createClassResolver },
  )
  const display = (classes: string) =>
    Object.assign({}, ...[resolve(classes)].flat(Infinity)).display
  // Tailwind emits `block`, `flex`, then `hidden`, so `hidden` wins either
  // way, as it does on the Web.
  for (const classes of ['block hidden', 'hidden block', 'flex hidden', 'hidden flex'])
    assert.equal(display(classes), 'none', classes)
})
