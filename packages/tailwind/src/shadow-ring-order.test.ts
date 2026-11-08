import assert from 'node:assert/strict'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { createCompiler, openCandidateCache, prepareFinalTailwindContext } from '@hozo/compiler'
import { createClassResolver } from '../../engine/src/class-resolver.ts'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

// #1230. No shadow or ring write had an ownership entry, so an input with
// one kept its authored order: `shadow-sm shadow-lg` took the large shadow
// where Tailwind emits `shadow-sm` last, and `ring-4 ring-2` took 2px.
const css = '@import "tailwindcss/theme.css" layer(theme); @tailwind utilities;'
const pairs = [
  ['shadow-sm', 'shadow-lg'],
  ['ring-2', 'ring-4'],
  ['shadow-sm', 'ring-2'],
  ['shadow-red-500', 'shadow-blue-500'],
  ['ring-red-500', 'ring-blue-500'],
  ['inset-shadow-sm', 'inset-shadow-xs'],
  ['md:shadow-lg', 'shadow-sm'],
  ['ring-2', 'ring-offset-2', 'ring-offset-4'],
  ['inset-ring-2', 'inset-ring-4'],
  ['ring-2', 'ring-inset'],
]
const source = (classes: string) =>
  `import {View} from '@hozo/core';export const A=()=> <View className="${classes}"/>`

async function context(names: string[]) {
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), names)
  return prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
}

test('shadows and rings settle in Tailwind order, whichever is written first', async () => {
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

test('Web and Native keep the shadow Tailwind keeps', async () => {
  const compiler = createCompiler()
  const final = await context(['shadow-sm', 'shadow-lg'])
  for (const classes of ['shadow-sm shadow-lg', 'shadow-lg shadow-sm']) {
    const web = compiler.prepareWebModule(source(classes)).emit(final)[0]!
    assert.match(web.css, /box-shadow: 0 1px 3px 0/, classes)
    const native = compiler.prepareNativeModule(source(classes)).emit(final).components[0]!
    assert.match(native.styles, /0 1px 3px 0/, classes)
    assert.doesNotMatch(native.styles, /0 10px 15px/, classes)
  }
})

test('the dynamic Native map keeps the same shadow', async () => {
  const names = ['shadow-sm', 'shadow-lg']
  const final = await context(names)
  const cache = openCandidateCache()
  cache.scanFile('shadow.ts', JSON.stringify(names.join(' ')), 0)
  const plan = cache.renderNativeModulePlan(final)
  for (const entry of plan.entries) assert.notEqual(entry.kind, 'refused', entry.candidate)
  const resolve = runInNewContext(
    `${plan.code.replace(/^import .*$/gm, '').replaceAll('export const ', 'const ')};hozoClasses`,
    { createClassResolver },
  )
  const style = (classes: string) => Object.assign({}, ...[resolve(classes)].flat(Infinity))
  for (const classes of ['shadow-sm shadow-lg', 'shadow-lg shadow-sm']) {
    assert.match(String(style(classes).boxShadow), /0 1px 3px 0/, classes)
  }
})
