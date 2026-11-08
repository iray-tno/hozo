import assert from 'node:assert/strict'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { createCompiler, openCandidateCache, prepareFinalTailwindContext } from '@hozo/compiler'
import { createClassResolver } from '../../engine/src/class-resolver.ts'
import { hozoTransformStyles } from '../../engine/src/transform-slots.ts'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

// #1230. `rotate-*` and the translate and scale axes had no ownership entry,
// so an input with one kept its authored order: `rotate-90 rotate-45` took
// 45deg where Tailwind's alphanumeric tiebreak puts `rotate-90` last, and
// `translate-x-8 translate-4` lost the x axis that Tailwind keeps at 32px.
const css = '@import "tailwindcss/theme.css" layer(theme); @tailwind utilities;'
const pairs = [
  ['rotate-45', 'rotate-90'],
  ['-rotate-12', 'rotate-6'],
  ['md:rotate-45', 'rotate-90'],
  ['scale-50', 'scale-75'],
  ['scale-50', 'scale-x-75'],
  ['scale-y-50', 'scale-150'],
  ['translate-x-4', 'translate-x-8'],
  ['translate-4', 'translate-x-8'],
  ['translate-y-2', 'translate-6'],
  ['hover:scale-110', 'scale-x-90'],
  ['translate-x-4', 'rotate-45'],
  ['scale-50', 'translate-y-2'],
]
const source = (classes: string) =>
  `import {View} from '@hozo/core';export const A=()=> <View className="${classes}"/>`

async function context(names: string[]) {
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), names)
  return prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
}

test('rotation and the translate and scale axes settle in Tailwind order, whichever is written first', async () => {
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

test('Native keeps the axis Tailwind keeps', async () => {
  const compiler = createCompiler()
  const final = await context(['translate-4', 'translate-x-8', 'rotate-45', 'rotate-90'])
  for (const classes of ['translate-x-8 translate-4', 'translate-4 translate-x-8']) {
    const out = compiler.prepareNativeModule(source(classes)).emit(final).components[0]!
    assert.match(out.styles, /translateX: 32\b/, classes)
    assert.match(out.styles, /translateY: 16\b/, classes)
  }
  for (const classes of ['rotate-90 rotate-45', 'rotate-45 rotate-90']) {
    const out = compiler.prepareNativeModule(source(classes)).emit(final).components[0]!
    assert.match(out.styles, /rotate: '90deg'/, classes)
  }
})

test('the dynamic Native map gives the same rotation', async () => {
  const names = ['rotate-45', 'rotate-90']
  const final = await context(names)
  const cache = openCandidateCache()
  cache.scanFile('rotate.ts', JSON.stringify(names.join(' ')), 0)
  const plan = cache.renderNativeModulePlan(final)
  for (const entry of plan.entries) assert.notEqual(entry.kind, 'refused', entry.candidate)
  const resolve = runInNewContext(
    `${plan.code.replace(/^import .*$/gm, '').replaceAll('export const ', 'const ')};hozoClasses`,
    { createClassResolver, hozoTransformStyles },
  )
  const style = (classes: string) => Object.assign({}, ...[resolve(classes)].flat(Infinity))
  for (const classes of ['rotate-90 rotate-45', 'rotate-45 rotate-90']) {
    assert.equal(JSON.stringify(style(classes).transform), '[{"rotate":"90deg"}]', classes)
  }
})

test('the dynamic Native map keeps the axis Tailwind keeps', async () => {
  const names = ['translate-4', 'translate-x-8']
  const final = await context(names)
  const cache = openCandidateCache()
  cache.scanFile('translate.ts', JSON.stringify(names.join(' ')), 0)
  const plan = cache.renderNativeModulePlan(final)
  for (const entry of plan.entries) assert.notEqual(entry.kind, 'refused', entry.candidate)
  const resolve = runInNewContext(
    `${plan.code.replace(/^import .*$/gm, '').replaceAll('export const ', 'const ')};hozoClasses`,
    { createClassResolver, hozoTransformStyles },
  )
  const style = (classes: string) => Object.assign({}, ...[resolve(classes)].flat(Infinity))
  for (const classes of ['translate-x-8 translate-4', 'translate-4 translate-x-8']) {
    assert.equal(
      JSON.stringify(style(classes).transform),
      '[{"translateX":32},{"translateY":16}]',
      classes,
    )
  }
})
