import assert from 'node:assert/strict'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { createCompiler, openCandidateCache, prepareFinalTailwindContext } from '@hozo/compiler'
import { createClassResolver } from '../../engine/src/class-resolver.ts'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

// #1230. Conditions on the element itself weigh the same as each other
// (`first:` and `data-active:`), or the same as the bare utility (`rtl:`,
// wrapped in `:where()`), so the later rule wins. Tailwind's order decides
// which is later; Hozo kept the order they were written in.
const css = '@theme {--spacing:.25rem; --breakpoint-md:48rem;} @tailwind utilities;'
const pairs = [
  ['rtl:p-4', 'p-2'],
  ['ltr:p-4', 'p-2'],
  ['rtl:p-4', 'md:p-2'],
  ['first:p-4', 'data-active:p-2'],
  ['odd:p-4', 'only:p-2'],
  ['data-[state=open]:p-4', 'first:p-2'],
  ['open:p-4', 'data-active:p-2'],
  ['empty:p-4', 'last:p-2'],
  ['first:p-4', 'hover:p-2'],
  ['required:p-4', 'focus:p-2'],
  ['nth-3:p-4', 'checked:p-2'],
  ['focus-within:p-4', 'enabled:p-2'],
]

const source = (classes: string) =>
  `import {View} from '@hozo/core';export const A=()=> <View className="${classes}"/>`

test('conditions on the element itself settle in Tailwind order, whichever is written first', async () => {
  const compiler = createCompiler()
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), [...new Set(pairs.flat())])
  const final = prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
  for (const pair of pairs) {
    const [forward, backward] = [pair, pair.toReversed()].map(
      (names) => compiler.prepareWebModule(source(names.join(' '))).emit(final)[0]!,
    )
    assert.equal(forward!.css, backward!.css, pair.join(' '))
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

test('the dynamic Native map ranks direction the way the static plans do', async () => {
  const names = ['rtl:p-4', 'p-2', 'ltr:p-6']
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), names)
  const final = prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
  const cache = openCandidateCache()
  cache.scanFile('direction.ts', JSON.stringify(names.join(' ')), 0)
  const plan = cache.renderNativeModulePlan(final)
  assert.ok(plan.ordering, 'a scalar conflict needs the ranked map')
  for (const isRTL of [false, true]) {
    const resolve = runInNewContext(
      `${plan.code.replace(/^import .*$/gm, '').replaceAll('export const ', 'const ')};hozoClasses`,
      { createClassResolver, I18nManager: { isRTL } },
    )
    for (const ordered of [names, names.toReversed()]) {
      const style = Object.assign({}, ...[resolve(ordered.join(' '))].flat(Infinity))
      // The direction's own utility wins in either authored order.
      assert.equal(style.paddingTop, isRTL ? 16 : 24, `${isRTL} ${ordered.join(' ')}`)
    }
  }
})
