import assert from 'node:assert/strict'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { createCompiler, openCandidateCache, prepareFinalTailwindContext } from '@hozo/compiler'
import { createClassResolver } from '../../engine/src/class-resolver.ts'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

// #1230. Only `text-left`, `text-center` and `text-right` had an ownership
// entry, so an input with `text-start`, `text-end` or `text-justify` kept its
// authored order: `text-left text-justify` took `justify` where Tailwind's
// alphanumeric tiebreak puts `text-left` last.
const css = '@import "tailwindcss/theme.css" layer(theme); @tailwind utilities;'
const pairs = [
  ['text-left', 'text-justify'],
  ['text-start', 'text-end'],
  ['text-center', 'text-start'],
  ['md:text-justify', 'text-right'],
  ['hover:text-end', 'text-center'],
]
const source = (classes: string) =>
  `import {Text} from '@hozo/core';export const A=()=> <Text className="${classes}">a</Text>`

async function context(names: string[]) {
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), names)
  return prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
}

test('text alignment settles in Tailwind order, whichever is written first', async () => {
  const compiler = createCompiler()
  const final = await context([...new Set(pairs.flat())])
  for (const pair of pairs) {
    const web = [pair, pair.toReversed()].map(
      (names) => compiler.prepareWebModule(source(names.join(' '))).emit(final)[0]!,
    )
    assert.deepEqual(web[0]!.diagnostics, web[1]!.diagnostics, pair.join(' '))
    assert.equal(web[0]!.css, web[1]!.css, pair.join(' '))
    assert.equal(web[0]!.jsx, web[1]!.jsx, pair.join(' '))
    const native = [pair, pair.toReversed()].map(
      (names) => compiler.prepareNativeModule(source(names.join(' '))).emit(final).components[0]!,
    )
    assert.deepEqual(native[0]!.diagnostics, native[1]!.diagnostics, pair.join(' '))
    assert.equal(native[0]!.styles, native[1]!.styles, pair.join(' '))
    assert.equal(native[0]!.jsx, native[1]!.jsx, pair.join(' '))
  }
})

test('the dynamic Native map ranks the same textAlign key', async () => {
  const names = ['text-left', 'text-justify']
  const final = await context(names)
  const cache = openCandidateCache()
  cache.scanFile('align.ts', JSON.stringify(names.join(' ')), 0)
  const plan = cache.renderNativeModulePlan(final)
  for (const entry of plan.entries) assert.notEqual(entry.kind, 'refused', entry.candidate)
  assert.ok(plan.ordering, 'same-key conflicts need the ranked map')
  const resolve = runInNewContext(
    `${plan.code.replace(/^import .*$/gm, '').replaceAll('export const ', 'const ')};hozoClasses`,
    { createClassResolver },
  )
  const style = (classes: string) => Object.assign({}, ...[resolve(classes)].flat(Infinity))
  for (const classes of ['text-left text-justify', 'text-justify text-left']) {
    assert.equal(style(classes).textAlign, 'left', classes)
  }
})
