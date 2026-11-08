import assert from 'node:assert/strict'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { createCompiler, openCandidateCache, prepareFinalTailwindContext } from '@hozo/compiler'
import { createClassResolver } from '../../engine/src/class-resolver.ts'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

// #1230. `cursor-*` and `object-*` fit had no ownership entry, so an input
// with one kept its authored order: `md:object-contain object-cover` kept
// `cover` at every width.
const css = '@import "tailwindcss/theme.css" layer(theme); @tailwind utilities;'
const pairs = [
  ['md:cursor-auto', 'cursor-pointer'],
  ['cursor-auto', 'cursor-pointer'],
  ['md:object-contain', 'object-cover'],
  ['hover:object-fill', 'object-cover'],
  ['object-contain', 'object-cover'],
]
const source = (classes: string) =>
  `import {Image} from '@hozo/core';export const A=()=> <Image alt="" className="${classes}"/>`

async function context(names: string[]) {
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), names)
  return prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
}

test('cursor and object fit settle in Tailwind order, whichever is written first', async () => {
  const compiler = createCompiler()
  const final = await context([...new Set(pairs.flat())])
  for (const pair of pairs) {
    const web = [pair, pair.toReversed()].map(
      (names) => compiler.prepareWebModule(source(names.join(' '))).emit(final)[0]!,
    )
    assert.deepEqual(web[0]!.diagnostics, web[1]!.diagnostics, pair.join(' '))
    assert.equal(web[0]!.css, web[1]!.css, pair.join(' '))
    const native = [pair, pair.toReversed()].map(
      (names) => compiler.prepareNativeModule(source(names.join(' '))).emit(final).components[0]!,
    )
    assert.deepEqual(native[0]!.diagnostics, native[1]!.diagnostics, pair.join(' '))
    assert.equal(native[0]!.styles, native[1]!.styles, pair.join(' '))
    assert.equal(native[0]!.jsx, native[1]!.jsx, pair.join(' '))
  }
})

test('the dynamic Native map ranks the same object fit key', async () => {
  const names = ['object-contain', 'object-cover', 'cursor-pointer', 'cursor-auto']
  const final = await context(names)
  const cache = openCandidateCache()
  cache.scanFile('fit.ts', JSON.stringify(names.join(' ')), 0)
  const plan = cache.renderNativeModulePlan(final)
  for (const entry of plan.entries) assert.notEqual(entry.kind, 'refused', entry.candidate)
  assert.ok(plan.ordering, 'same-key conflicts need the ranked map')
  const resolve = runInNewContext(
    `${plan.code.replace(/^import .*$/gm, '').replaceAll('export const ', 'const ')};hozoClasses`,
    { createClassResolver },
  )
  const style = (classes: string) => Object.assign({}, ...[resolve(classes)].flat(Infinity))
  // Tailwind's alphanumeric tiebreak puts `object-cover` after
  // `object-contain`, and `cursor-pointer` after `cursor-auto`.
  for (const classes of ['object-cover object-contain', 'object-contain object-cover']) {
    assert.equal(style(classes).objectFit, 'cover', classes)
  }
  for (const classes of ['cursor-pointer cursor-auto', 'cursor-auto cursor-pointer']) {
    assert.equal(style(classes).cursor, 'pointer', classes)
  }
})
