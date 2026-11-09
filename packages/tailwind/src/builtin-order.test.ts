import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  prepareBuiltinTailwindContext,
  prepareFinalTailwindContext,
  tailwindClassesRankable,
} from '@hozo/compiler'
import { __unstable__loadDesignSystem } from 'tailwindcss'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

// #1230. A compile with no project CSS gets its rule descriptors from the
// Tailwind facts built into Hozo (crates/hozo_ir/src/tailwind_builtin.rs)
// instead of a captured Tailwind. The shared comparator and assessment then
// read them exactly as they read a captured project's. This checks that the
// two agree, against real Tailwind, over every class Tailwind's default theme
// offers and every built-in variant: the same verdict for each rule, and the
// same relative order among the ranked ones.
const css = '@import "tailwindcss/theme.css" layer(theme); @tailwind utilities;'

async function universe() {
  const dir = tailwindPackageDir()
  const theme = readFileSync(path.join(dir, 'theme.css'), 'utf8')
  const design = await __unstable__loadDesignSystem(
    '@import "tailwindcss/theme.css"; @tailwind utilities;',
    { base: dir, loadStylesheet: async () => ({ path: 'theme.css', base: dir, content: theme }) },
  )
  const classes = design.getClassList().map(([name]) => name)
  const variants = design
    .getVariants()
    .flatMap((variant) =>
      variant.values?.length
        ? variant.values.map((value) => `${variant.name}${variant.hasDash ? '-' : ''}${value}`)
        : [variant.name],
    )
  const probes = ['p-4', 'p-2', 'text-lg', 'text-red-500', 'bg-blue-500', 'translate-x-4', 'flex']
  const stacked = [
    'md:hover',
    'dark:md',
    'hover:focus',
    'group-hover:focus-visible',
    'lg:aria-checked',
  ]
  return [
    ...new Set([
      ...classes,
      ...variants.flatMap((variant) => probes.map((probe) => `${variant}:${probe}`)),
      ...stacked.flatMap((variant) => probes.map((probe) => `${variant}:${probe}`)),
      'data-[state=open]:p-4',
      'p-4!',
      '[color:red]',
    ]),
  ]
}

test('built-in descriptors give the captured verdicts and order for every Tailwind class', async () => {
  const names = await universe()
  const captured = prepareFinalTailwindContext(
    JSON.stringify((await prepareTailwindOrder(css, tailwindPackageDir(), names)).snapshot),
  ).rulePriorities()
  const builtin = prepareBuiltinTailwindContext(names).rulePriorities()
  const sorted = [...names].sort()
  const byName = (rules: typeof captured.rules) =>
    new Map(rules.map((rule) => [sorted[rule.candidateId]!, rule]))
  const real = byName(captured.rules)
  const ours = byName(builtin.rules)

  // Everything the built-in data describes, real Tailwind describes the same
  // way. What it does not describe (arbitrary variants, `!`, arbitrary
  // properties) is a barrier, never a guess.
  const disagreements: string[] = []
  for (const [name, rule] of ours) {
    const expected = real.get(name)
    if (!expected) disagreements.push(`${name}: described only by the built-in data`)
    else if (
      rule.reason !== expected.reason ||
      JSON.stringify(rule.specificity) !== JSON.stringify(expected.specificity)
    )
      disagreements.push(
        `${name}: ${rule.reason ?? 'ranked'} ${rule.specificity} vs ${expected.reason ?? 'ranked'} ${expected.specificity}`,
      )
  }
  assert.deepEqual(disagreements.slice(0, 20), [])

  // The same relative order among everything both rank.
  const ranked = [...ours].filter(
    ([name, rule]) => rule.rank !== undefined && real.get(name)?.rank !== undefined,
  )
  const order = (rank: (name: string) => number) =>
    ranked
      .map(([name]) => name)
      .sort((a, b) => rank(a) - rank(b))
      .join(' ')
  assert.equal(
    order((name) => ours.get(name)!.rank!),
    order((name) => real.get(name)!.rank!),
  )

  // How much the built-in data covers, so a regression shows as a number:
  // of the rules real Tailwind gives a rank, the share it describes. A class
  // whose writes are outside the ranked domain (masks, `inline-*` sizes) is
  // a barrier whether or not it is described, so only the others count.
  const flags = tailwindClassesRankable(sorted)
  const inDomain = new Set(sorted.filter((_, index) => flags[index]))
  const rankable = [...real].filter(([name, rule]) => rule.rank !== undefined && inDomain.has(name))
  const missing = rankable.filter(([name]) => !ours.has(name)).map(([name]) => name)
  const coverage = 1 - missing.length / rankable.length
  console.log(`ranked-rule coverage ${(coverage * 100).toFixed(1)}% of ${rankable.length}`)
  console.log(`missing: ${missing.slice(0, 40).join(' ')}`)
  assert.ok(coverage > 0.99, `built-in coverage ${coverage}`)
  for (const barrier of ['data-[state=open]:p-4', 'p-4!', '[color:red]'])
    assert.ok(!ours.has(barrier), barrier)
})

test('the built-in data is what the installed Tailwind generates', async () => {
  const { execFileSync } = await import('node:child_process')
  const script = new URL('../../../scripts/generate-tailwind-builtin-order.mjs', import.meta.url)
  execFileSync(process.execPath, [script.pathname.replace(/^\/([A-Za-z]:)/, '$1'), '--check'], {
    stdio: 'pipe',
  })
})
