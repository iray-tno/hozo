import assert from 'node:assert/strict'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import {
  createCompiler,
  openCandidateCache,
  prepareBuiltinTailwindContext,
  prepareFinalTailwindContext,
} from '@hozo/compiler'
import { createClassResolver } from '../../engine/src/class-resolver.ts'
import { hozoFilterStyles } from '../../engine/src/filter-slots.ts'
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

function runtime(code: string) {
  return runInNewContext(
    `${code.replace(/^import .*$/gm, '').replaceAll('export const ', 'const ')};hozoClasses`,
    { createClassResolver, hozoFilterStyles },
  ) as ReturnType<typeof createClassResolver>
}

const flatten = (styles: object[]) => Object.assign({}, ...styles.flat(Infinity))

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
  const resolve = runtime(plan.code)
  for (const classes of ['brightness-150 brightness-50', 'brightness-50 brightness-150']) {
    assert.match(JSON.stringify(flatten(resolve(classes)).filter), /brightness\(150%\)/, classes)
  }
})

test('non-completion resets rank in captured and built-in contexts', async () => {
  const names = [
    'blur-sm',
    'filter-none',
    'backdrop-blur-sm',
    'backdrop-filter-none',
    'active:p-2',
    'hover:p-4',
  ]
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), names)
  const upstream = prepared.snapshot.candidates
  for (const [blur, reset] of [
    ['blur-sm', 'filter-none'],
    ['backdrop-blur-sm', 'backdrop-filter-none'],
  ]) {
    const rank = (name: string) => {
      const candidate = upstream.find((entry) => entry.candidate === name)
      assert.ok(candidate?.firstRuleRank != null, name)
      return candidate.firstRuleRank
    }
    assert.ok(rank(reset!) > rank(blur!), reset)
  }
  const compiler = createCompiler()
  const cache = openCandidateCache()
  cache.scanFile('filter.ts', JSON.stringify(names.join(' ')), 0)
  for (const final of [
    prepareFinalTailwindContext(JSON.stringify(prepared.snapshot)),
    prepareBuiltinTailwindContext(names),
  ]) {
    const plan = cache.renderNativeModulePlan(final)
    assert.ok(plan.ordering?.ranks['filter-none'])
    assert.equal(
      plan.entries.find((entry) => entry.candidate === 'backdrop-filter-none')?.kind,
      'refused',
    )
    const resolve = runtime(plan.code)
    for (const classes of [
      'active:p-2 hover:p-4 filter-none',
      'hover:p-4 active:p-2 filter-none',
    ]) {
      const style = flatten(resolve(classes, { pressed: true, hovered: true }))
      assert.equal(style.paddingTop, 8)
      assert.equal(style.filter, 'none')
    }
    for (const classes of ['blur-sm filter-none', 'filter-none blur-sm']) {
      const result = compiler.prepareNativeModule(source(classes)).emit(final).components[0]!
      assert.match(result.styles, /filter: 'none'/)
      assert.equal(flatten(resolve(classes)).filter, 'none')
    }
    for (const classes of [
      'backdrop-filter-none backdrop-blur-sm',
      'backdrop-blur-sm backdrop-filter-none',
    ]) {
      const result = compiler.prepareWebModule(source(classes)).emit(final)[0]!
      assert.match(result.css, /backdrop-filter: none/)
    }
  }
})

test('a genuinely uncaptured drawable utility retains authored fallback and tuple elision', async () => {
  const generate = async (names: string[]) => {
    const cache = openCandidateCache()
    cache.scanFile('fallback.ts', JSON.stringify(names.join(' ')), 0)
    const plan = cache.renderNativeModulePlan(await context(names))
    assert.equal(plan.entries.find((entry) => entry.candidate === 'text-brand')?.kind, 'style')
    assert.equal(plan.ordering?.ranks['text-brand'], undefined)
    return plan.code
  }
  const uniform = await generate([
    'p-2',
    'p-4',
    'hover:opacity-25',
    'hover:opacity-75',
    'text-brand',
  ])
  assert.doesNotMatch(uniform, /\{ opacity: [\d.]+ \}, \d+\]/)
  const resolve = runtime(uniform)
  assert.equal(flatten(resolve('p-4 p-2')).paddingTop, 16)
  assert.equal(flatten(resolve('p-4 text-brand p-2')).paddingTop, 8)
  assert.equal(flatten(resolve('p-2 text-brand p-4')).paddingTop, 16)
  const state = { hovered: true, pressed: true }
  assert.equal(
    flatten(resolve('hover:opacity-75 text-brand hover:opacity-25', state)).opacity,
    0.25,
  )
  assert.equal(
    flatten(resolve('hover:opacity-25 text-brand hover:opacity-75', state)).opacity,
    0.75,
  )
  const competing = await generate(['hover:opacity-25', 'active:opacity-75', 'text-brand'])
  assert.match(competing, /\{ opacity: 0.75 \}, \d+\]/)
  assert.equal(
    flatten(runtime(competing)('active:opacity-75 text-brand hover:opacity-25', state)).opacity,
    0.75,
  )
})
