import assert from 'node:assert/strict'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { createCompiler, openCandidateCache, prepareFinalTailwindContext } from '@hozo/compiler'
import { createClassResolver } from '../../engine/src/class-resolver.ts'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

// #1230. No filter function had an ownership entry, so an input with one
// kept its authored order: `blur-sm blur-lg` took the large blur where
// Tailwind emits `blur-sm` last.
const css = '@import "tailwindcss/theme.css" layer(theme); @tailwind utilities;'
const pairs = [
  ['blur-sm', 'blur-lg'],
  ['brightness-50', 'brightness-150'],
  ['grayscale', 'grayscale-0'],
  ['blur-sm', 'grayscale'],
  ['md:blur-lg', 'blur-sm'],
  ['hue-rotate-15', 'hue-rotate-90'],
  ['backdrop-blur-sm', 'backdrop-blur-lg'],
  ['backdrop-opacity-50', 'backdrop-opacity-75'],
]
const source = (classes: string) =>
  `import {View} from '@hozo/core';export const A=()=> <View className="${classes}"/>`

async function context(names: string[]) {
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), names)
  return prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
}

test('filter functions settle in Tailwind order, whichever is written first', async () => {
  const compiler = createCompiler()
  const final = await context([...new Set(pairs.flat())])
  for (const pair of pairs) {
    const web = [pair, pair.toReversed()].map(
      (names) => compiler.prepareWebModule(source(names.join(' '))).emit(final)[0]!,
    )
    assert.deepEqual(web[0]!.diagnostics, web[1]!.diagnostics, pair.join(' '))
    assert.equal(web[0]!.css, web[1]!.css, pair.join(' '))
    assert.equal(web[0]!.jsx, web[1]!.jsx, pair.join(' '))
    // `backdrop-*` is refused on Native, whichever order it is written in.
    const native = [pair, pair.toReversed()].map(
      (names) => compiler.prepareNativeModule(source(names.join(' '))).emit(final).components[0]!,
    )
    assert.deepEqual(native[0]!.diagnostics, native[1]!.diagnostics, pair.join(' '))
    assert.equal(native[0]!.styles, native[1]!.styles, pair.join(' '))
    assert.equal(native[0]!.jsx, native[1]!.jsx, pair.join(' '))
  }
})

test('the dynamic Native map keeps the filter Tailwind keeps', async () => {
  const names = ['brightness-50', 'brightness-150']
  const final = await context(names)
  const compiler = createCompiler()
  const expected = compiler.prepareNativeModule(source(names.join(' '))).emit(final).components[0]!
  assert.match(expected.styles, /brightness\(150%\)/)
  const cache = openCandidateCache()
  cache.scanFile('filter.ts', JSON.stringify(names.join(' ')), 0)
  const plan = cache.renderNativeModulePlan(final)
  for (const entry of plan.entries) assert.notEqual(entry.kind, 'refused', entry.candidate)
  const resolve = runInNewContext(
    `${plan.code.replace(/^import .*$/gm, '').replaceAll('export const ', 'const ')};hozoClasses`,
    { createClassResolver },
  )
  const style = (classes: string) => Object.assign({}, ...[resolve(classes)].flat(Infinity))
  for (const classes of ['brightness-150 brightness-50', 'brightness-50 brightness-150']) {
    assert.match(JSON.stringify(style(classes).filter), /brightness\(150%\)/, classes)
  }
})
