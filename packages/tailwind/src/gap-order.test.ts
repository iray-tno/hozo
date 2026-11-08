import assert from 'node:assert/strict'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { createCompiler, openCandidateCache, prepareFinalTailwindContext } from '@hozo/compiler'
import { createClassResolver } from '../../engine/src/class-resolver.ts'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

// #1230. Gaps were left out of the ordering domain, so an input with one kept
// its authored order: `md:gap-4 gap-2` kept `gap-2` at every width, and
// `gap-2 active:gap-4` lost the pressed gap on Native.
const css = '@import "tailwindcss/theme.css" layer(theme); @tailwind utilities;'
const pairs = [
  ['md:gap-4', 'gap-2'],
  ['md:gap-x-4', 'gap-x-2'],
  ['md:gap-y-4', 'gap-y-2'],
  ['active:gap-4', 'gap-2'],
  ['active:gap-x-4', 'gap-x-2'],
  ['gap-x-2', 'gap-4'],
  ['gap-y-2', 'gap-4'],
  ['md:gap-4', 'gap-x-2'],
]
const source = (classes: string, style = '') =>
  `import {Pressable} from '@hozo/core';export const A=()=> <Pressable className="${classes}"${style}/>`

async function context(names: string[]) {
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), names)
  return prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
}

test('gaps settle in Tailwind order, whichever is written first', async () => {
  const compiler = createCompiler()
  const final = await context([...new Set(pairs.flat())])
  // An authored style is its own tier above the classes; ranking the classes
  // must leave its composition alone.
  for (const style of ['', ' style={{gap: 24}}', ' style={{rowGap: 4}}']) {
    for (const pair of pairs) {
      const label = `${pair.join(' ')}${style}`
      const web = [pair, pair.toReversed()].map(
        (names) => compiler.prepareWebModule(source(names.join(' '), style)).emit(final)[0]!,
      )
      assert.deepEqual(web[0]!.diagnostics, [], label)
      assert.equal(web[0]!.css, web[1]!.css, label)
      const native = [pair, pair.toReversed()].map(
        (names) =>
          compiler.prepareNativeModule(source(names.join(' '), style)).emit(final).components[0]!,
      )
      assert.deepEqual(native[0]!.diagnostics, native[1]!.diagnostics, label)
      if (native[0]!.diagnostics.length === 0) {
        assert.equal(native[0]!.styles, native[1]!.styles, label)
        assert.equal(native[0]!.jsx, native[1]!.jsx, label)
      }
    }
  }
})

test('the dynamic Native map ranks gaps', async () => {
  const names = ['gap-2', 'active:gap-4', 'gap-x-2', 'gap-4']
  const final = await context(names)
  const cache = openCandidateCache()
  cache.scanFile('gap.ts', JSON.stringify(names.join(' ')), 0)
  const plan = cache.renderNativeModulePlan(final)
  for (const entry of plan.entries) assert.notEqual(entry.kind, 'refused', entry.candidate)
  assert.ok(plan.ordering, 'same-key gap conflicts need the ranked map')
  const resolve = runInNewContext(
    `${plan.code.replace(/^import .*$/gm, '').replaceAll('export const ', 'const ')};hozoClasses`,
    { createClassResolver },
  )
  const style = (classes: string, pressed: boolean) =>
    Object.assign({}, ...[resolve(classes, { pressed })].flat(Infinity))
  for (const classes of ['gap-2 active:gap-4', 'active:gap-4 gap-2']) {
    assert.equal(style(classes, false).gap, 8, classes)
    assert.equal(style(classes, true).gap, 16, classes)
  }
  // Different keys: Yoga's axis gutter wins by key, as Tailwind's later
  // `column-gap` does.
  for (const classes of ['gap-x-2 gap-4', 'gap-4 gap-x-2']) {
    assert.equal(style(classes, false).columnGap, 8, classes)
    assert.equal(style(classes, false).gap, 16, classes)
  }
})
