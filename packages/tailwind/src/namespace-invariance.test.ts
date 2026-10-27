import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import {
  createCompiler,
  openCandidateCache,
  prepareFinalTailwindContext,
  prepareTailwindContext,
} from '@hozo/compiler'
import { createClassResolver } from '../../engine/src/class-resolver.ts'
import { hozoTransformStyles } from '../../engine/src/transform-slots.ts'
import { loadTheme, prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

const base = tailwindPackageDir()
const css = `${readFileSync(path.join(base, 'theme.css'), 'utf8')}\n@tailwind utilities;`
const fixtures = [
  'p-4 p-2',
  'm-4 m-2 p-4 p-2',
  'w-8 w-4 h-8 h-4 min-w-8 min-w-4 max-h-8 max-h-4',
  'bg-[#112233] bg-[#223344] text-[#112233] text-[#223344]',
  'p-4 p-2 bg-[#112233] focus:bg-[#223344] active:bg-[#334455] hover:focus:bg-[#445566]',
  'active:p-4 focus:p-2 disabled:p-4 p-4 p-2',
  'focus-visible:p-4 hover:p-2 p-4 p-2',
  'p-4 p-2 ps-2 gap-2',
  'p-4 p-2 rotate-45 rtl:p-4',
  'p-4 p-2 sm:p-4',
  'p-4 p-2 p-4!',
]
const unrelated = Array.from({ length: 160 }, (_, i) => `${['m', 'p', 'w', 'h'][i % 4]}-${i + 1}`)
const variants = [
  'dark',
  'sm',
  'md',
  'lg',
  'rtl',
  'ltr',
  'disabled',
  'hover',
  'focus',
  'focus-visible',
  'active',
  'first',
  'last',
  'aria-selected',
  'data-[open]',
  '[&:where(:hover)]',
]
const expanded = [
  ...unrelated,
  ...variants.map((prefix) => `${prefix}:bg-red-500`),
  'border-2',
  'gap-4',
  'text-lg',
  'font-bold',
  'bg-red-500!',
]

const source = (classes: string) =>
  `import {Pressable,Text} from '@hozo/core';export const A=()=> <Pressable className="${classes}"><Text>Hello</Text></Pressable>`
function generated(code: string) {
  return runInNewContext(
    `${code.replace(/^import .*$/gm, '').replaceAll('export const ', 'const ')}\nhozoClasses`,
    { createClassResolver, hozoTransformStyles, I18nManager: { isRTL: false } },
  )
}

test('actual scalar output and generated resolver selection are invariant under larger unrelated candidate namespaces', async () => {
  const theme = await loadTheme(css, base)
  const compiler = createCompiler(theme)
  const large = await prepareTailwindOrder(css, base, [
    ...expanded,
    ...fixtures.flatMap((value) => value.split(' ')),
  ])
  const big = prepareFinalTailwindContext(JSON.stringify(large.snapshot))
  const bigFacts = big.rulePriorities().rules
  let movedRanks = 0,
    movedVariants = 0,
    comparisons = 0
  for (const classes of fixtures) {
    const names = [...new Set(classes.split(' '))]
    const small = await prepareTailwindOrder(css, base, names)
    const local = prepareFinalTailwindContext(JSON.stringify(small.snapshot))
    assert.notEqual(local.fingerprint, big.fingerprint)
    for (const name of names) {
      const a = small.lookup(name)!,
        b = large.lookup(name)!
      for (let index = 0; index < a.rules.length; index++) {
        const left = local.rulePriorities().rules.find((row) => row.ruleId === a.rules[index]!.id)
        const right = bigFacts.find((row) => row.ruleId === b.rules[index]!.id)
        if (left?.rank !== undefined && right?.rank !== undefined && left.rank !== right.rank)
          movedRanks++
        if (a.rules[index]!.variantOrder !== b.rules[index]!.variantOrder) movedVariants++
      }
    }
    const cache = openCandidateCache()
    cache.scanFile('runtime.ts', JSON.stringify(classes), 0)
    const resolveSmall = generated(cache.renderNativeModulePlan(local, theme).code)
    const resolveBig = generated(cache.renderNativeModulePlan(big, theme).code)
    for (const value of [classes, classes.split(' ').reverse().join(' ')]) {
      const input = source(value)
      const webLocal = compiler.prepareWebModule(input).emit(local)
      const webBig = compiler.prepareWebModule(input).emit(big)
      const nativeLocal = compiler.prepareNativeModule(input).emit(local)
      const nativeBig = compiler.prepareNativeModule(input).emit(big)
      assert.deepEqual(webLocal, webBig, value)
      assert.deepEqual(nativeLocal, nativeBig, value)
      for (let bits = 0; bits < 32; bits++) {
        const facts = {
          hovered: !!(bits & 1),
          focused: !!(bits & 2),
          focusVisible: !!(bits & 4),
          pressed: !!(bits & 8),
          disabled: !!(bits & 16),
        }
        const a = Object.assign({}, ...resolveSmall(value, facts))
        const b = Object.assign({}, ...resolveBig(value, facts))
        // Values are the actual style objects, not their namespace-local ranks.
        assert.equal(JSON.stringify(a), JSON.stringify(b), `${value}/${bits}`)
        comparisons++
      }
    }
  }
  assert.ok(movedRanks > 0, 'the namespaces must genuinely renumber priorities')
  assert.ok(movedVariants > 0, 'Tailwind must actually rebase observed variant bit positions')
  assert.equal(comparisons, 704)
})

test('unrelated candidate insertion preserves restricted upstream rule order, but CSS epoch changes do not preserve values', async () => {
  const names = ['p-2', 'p-4', 'hover:p-4', 'focus:p-2', 'active:p-4', 'hover:focus:p-4']
  const small = await prepareTailwindOrder(css, base, names)
  const large = await prepareTailwindOrder(css, base, [...expanded, ...names])
  const sequence = (prepared) => {
    const byId = new Map(prepared.snapshot.candidates.map((row) => [row.id, row]))
    return prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
      .ruleOrder()
      .rules.map((row) => byId.get(row.candidateId)!.candidate)
      .filter((name) => names.includes(name))
  }
  assert.deepEqual(sequence(small), sequence(large))
  const changedCss = '@theme {--spacing:.5rem;} @tailwind utilities;'
  const changed = await prepareTailwindOrder(changedCss, base, names)
  const a = createCompiler(await loadTheme(css, base))
    .prepareWebModule(source('p-4 p-2'))
    .emit(prepareFinalTailwindContext(JSON.stringify(small.snapshot)))[0]!
  const b = createCompiler(await loadTheme(changedCss, base))
    .prepareWebModule(source('p-4 p-2'))
    .emit(prepareFinalTailwindContext(JSON.stringify(changed.snapshot)))[0]!
  assert.notEqual(small.snapshot.fingerprint, changed.snapshot.fingerprint)
  assert.notEqual(a.css, b.css)
  assert.match(a.css, /padding-top: 16px/)
  assert.match(b.css, /padding-top: 32px/)
  const old = createCompiler()
    .prepareWebModule(source('p-4 p-2'))
    .emit(prepareTailwindContext(JSON.stringify(small.snapshot)))[0]!
  assert.notEqual(
    a.css,
    old.css,
    'legacy wrong winners remain a negative control, not a new expected value',
  )
})
