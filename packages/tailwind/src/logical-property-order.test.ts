import assert from 'node:assert/strict'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { createCompiler, openCandidateCache, prepareFinalTailwindContext } from '@hozo/compiler'
import { createClassResolver } from '../../engine/src/class-resolver.ts'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

// #1230. Logical edges and insets were left out of the ordering domain,
// so an input with one kept its authored order: `md:px-4 px-2` kept `px-2` at
// every width, and `ps-2 px-4` let `px-4` overwrite the start edge.
const css = '@import "tailwindcss/theme.css" layer(theme); @tailwind utilities;'
const pairs = [
  ['md:px-4', 'px-2'],
  ['md:ps-4', 'ps-2'],
  ['md:mx-4', 'mx-2'],
  ['md:mx-auto', 'mx-2'],
  ['md:-mx-4', 'mx-2'],
  ['md:inset-4', 'inset-2'],
  ['md:inset-x-4', 'inset-x-2'],
  ['md:start-4', 'start-2'],
  ['hover:px-4', 'px-2'],
  ['ps-2', 'px-4'],
  ['px-2', 'p-4'],
  ['me-2', 'mx-4'],
  ['mx-auto', 'm-4'],
  ['start-2', 'inset-x-4'],
  ['top-2', 'inset-4'],
  ['inset-y-2', 'inset-4'],
]
const source = (classes: string) =>
  `import {Pressable} from '@hozo/core';export const A=()=> <Pressable className="${classes}"/>`

async function context(names: string[]) {
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), names)
  return prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
}

test('logical edges and insets settle in Tailwind order, whichever is written first', async () => {
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

test('Native writes to the same logical key in Tailwind order', async () => {
  const compiler = createCompiler()
  const final = await context(['ps-2', 'px-4'])
  for (const classes of ['ps-2 px-4', 'px-4 ps-2']) {
    const native = compiler.prepareNativeModule(source(classes)).emit(final).components[0]!
    assert.deepEqual(native.diagnostics, [], classes)
    // Tailwind emits `padding-inline` before `padding-inline-start`, so the
    // start edge is `ps-2`'s in either order.
    const starts = [...native.styles.matchAll(/paddingStart: (\d+)/g)].map((match) => match[1])
    assert.equal(starts.at(-1), '8', `${classes}:\n${native.styles}`)
  }
})

test('the dynamic Native map ranks the same logical writes', async () => {
  const names = ['ps-2', 'px-4', 'me-2', 'mx-4']
  const final = await context(names)
  const cache = openCandidateCache()
  cache.scanFile('logical.ts', JSON.stringify(names.join(' ')), 0)
  const plan = cache.renderNativeModulePlan(final)
  for (const entry of plan.entries) assert.notEqual(entry.kind, 'refused', entry.candidate)
  assert.ok(plan.ordering, 'same-key logical conflicts need the ranked map')
  const resolve = runInNewContext(
    `${plan.code.replace(/^import .*$/gm, '').replaceAll('export const ', 'const ')};hozoClasses`,
    { createClassResolver },
  )
  const style = (classes: string) => Object.assign({}, ...[resolve(classes)].flat(Infinity))
  for (const classes of ['ps-2 px-4', 'px-4 ps-2']) {
    assert.equal(style(classes).paddingStart, 8, classes)
    assert.equal(style(classes).paddingEnd, 16, classes)
  }
  for (const classes of ['me-2 mx-4', 'mx-4 me-2']) {
    assert.equal(style(classes).marginStart, 16, classes)
    assert.equal(style(classes).marginEnd, 8, classes)
  }
})

/**
 * The left and right padding React Native lays out for a flattened style.
 * Yoga prefers start/end to left/right whatever the order; with
 * `swapLeftAndRightInRTL` (the default) an RTL layout first overwrites
 * start with left and end with right. See `YogaLayoutableShadowNode.cpp`.
 */
function nativePadding(style: Record<string, number>, rtl: boolean, swap: boolean) {
  let { paddingStart: start, paddingEnd: end, paddingLeft: left, paddingRight: right } = style
  if (swap && rtl) {
    if (left !== undefined) [start, left] = [left, undefined]
    if (right !== undefined) [end, right] = [right, undefined]
  }
  const [leading, trailing] = rtl ? [end, start] : [start, end]
  return [leading ?? left ?? 0, trailing ?? right ?? 0]
}

test('a list mixing physical and logical padding lays out as Tailwind does, with or without the RTL swap', async () => {
  // #2018. [classes, hovered, [left, right] in LTR, [left, right] in RTL],
  // the numbers Tailwind gives in Chromium.
  const cases: [string, boolean, number[], number[]][] = [
    ['px-8 pl-1', false, [4, 32], [4, 32]],
    ['pl-1 px-8', false, [4, 32], [4, 32]],
    ['ps-8 pl-1', false, [4, 0], [4, 32]],
    ['pe-8 pl-1', false, [4, 32], [4, 0]],
    ['hover:ps-8 pl-1', false, [4, 0], [4, 0]],
    ['hover:ps-8 pl-1', true, [32, 0], [4, 32]],
    ['ps-8 hover:pl-1', true, [4, 0], [4, 32]],
  ]
  const names = [...new Set(cases.flatMap(([classes]) => classes.split(' ')))]
  const final = await context(names)
  const cache = openCandidateCache()
  cache.scanFile('logical-physical.ts', JSON.stringify(names.join(' ')), 0)
  const plan = cache.renderNativeModulePlan(final)
  assert.ok(plan.ordering)
  assert.match(plan.code, /ambient: \{ rtl: I18nManager\.isRTL/)
  const resolver = (isRTL: boolean) =>
    runInNewContext(
      `${plan.code.replace(/^import .*$/gm, '').replaceAll('export const ', 'const ')};hozoClasses`,
      { createClassResolver, I18nManager: { isRTL } },
    )
  for (const rtl of [false, true]) {
    const resolve = resolver(rtl)
    for (const [classes, hovered, ltrExpected, rtlExpected] of cases) {
      const style = Object.assign({}, ...[resolve(classes, { hovered })].flat(Infinity))
      for (const swap of [false, true]) {
        assert.deepEqual(
          nativePadding(style, rtl, swap),
          rtl ? rtlExpected : ltrExpected,
          `${classes}${hovered ? ' (hovered)' : ''} ${rtl ? 'rtl' : 'ltr'} swap=${swap}`,
        )
      }
    }
  }
})

test('even physical sides, a logical-only family, or an unranked mix are not projected', () => {
  const p4 = { paddingTop: 16, paddingRight: 16, paddingBottom: 16, paddingLeft: 16 }
  const ranked = createClassResolver({
    schema: 1,
    styles: { 'p-4': p4, 'ms-2': { marginStart: 8 } },
    ambient: { rtl: true, ltr: false },
    ordering: { schema: 1, ranks: { 'p-4': [1], 'ms-2': [2] } },
  })
  // The swap moves both sides of `p-4` alike, so it stays physical.
  assert.deepEqual(ranked('p-4 ms-2'), [p4, { marginStart: 8 }])
  const unranked = createClassResolver(
    { 'px-8': { paddingStart: 32, paddingEnd: 32 }, 'p-1': { paddingLeft: 4, paddingRight: 4 } },
    {},
  )
  assert.deepEqual(unranked('px-8 p-1'), [
    { paddingStart: 32, paddingEnd: 32 },
    { paddingLeft: 4, paddingRight: 4 },
  ])
})

test('a physical utility on its own keeps its side in both directions, ranked or not (#2050)', () => {
  // Tailwind keeps `pl-1` on the left in RTL; React Native's default swap
  // would move a plain `paddingLeft` to the right.
  for (const rtl of [false, true]) {
    const ambient = { rtl, ltr: !rtl }
    const resolvers = [
      createClassResolver({
        schema: 1,
        styles: { 'pl-1': { paddingLeft: 4 } },
        ambient,
        ordering: { schema: 1, ranks: { 'pl-1': [1] } },
      }),
      createClassResolver({ 'pl-1': { paddingLeft: 4 } }, {}, undefined, {}, ambient),
    ]
    for (const resolve of resolvers) {
      const style = Object.assign({}, ...[resolve('pl-1')].flat(Infinity))
      for (const swap of [false, true])
        assert.deepEqual(nativePadding(style, rtl, swap), [4, 0], `rtl=${rtl} swap=${swap}`)
    }
  }
})

test('the generated map keeps a lone physical edge on its side in both directions (#2050)', async () => {
  // [classes, [left, right]], the same in LTR and RTL in Tailwind.
  const cases: [string, number[]][] = [
    ['pl-1', [4, 0]],
    ['pr-2', [0, 8]],
    ['p-4 pl-1', [4, 16]],
    ['pl-1 p-4', [4, 16]],
    ['p-4', [16, 16]],
  ]
  const names = [...new Set(cases.flatMap(([classes]) => classes.split(' ')))]
  const final = await context(names)
  const cache = openCandidateCache()
  cache.scanFile('physical.ts', JSON.stringify(names.join(' ')), 0)
  const plan = cache.renderNativeModulePlan(final)
  assert.match(plan.code, /import \{ I18nManager \} from 'react-native'/)
  for (const rtl of [false, true]) {
    const resolve = runInNewContext(
      `${plan.code.replace(/^import .*$/gm, '').replaceAll('export const ', 'const ')};hozoClasses`,
      { createClassResolver, I18nManager: { isRTL: rtl } },
    )
    for (const [classes, expected] of cases) {
      const style = Object.assign({}, ...[resolve(classes)].flat(Infinity))
      for (const swap of [false, true])
        assert.deepEqual(
          nativePadding(style, rtl, swap),
          expected,
          `${classes} ${rtl ? 'rtl' : 'ltr'} swap=${swap}`,
        )
    }
  }
})
