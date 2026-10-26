// The expected order comes from Tailwind's generated CSS, not a JS copy of
// Rust's comparator. No browser/Native cascade or utility support claim here.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { prepareTailwindContext } from '@hozo/compiler'
import { compile } from 'tailwindcss'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

const base = tailwindPackageDir()
const theme = readFileSync(path.join(base, 'theme.css'), 'utf8')

async function observe(names: string[], additions = '') {
  const css = `${theme}\n@tailwind utilities;\n${additions}`
  const prepared = await prepareTailwindOrder(css, base, names)
  const sheet = (await compile(css, { base })).build(names)
  const context = prepareTailwindContext(JSON.stringify(prepared.snapshot))
  return { prepared, sheet, context }
}

function candidateNames(prepared, rules) {
  const seen = new Set<number>()
  return rules
    .filter(({ candidateId }) => !seen.has(candidateId) && seen.add(candidateId))
    .map(({ candidateId }) => prepared.snapshot.candidates[candidateId].candidate)
}

function selectorOffset(sheet: string, selector: string): number {
  // Tailwind may flatten nested state selectors into `.candidate:active`.
  // Requiring `{` directly after the root silently drops those rules, while
  // a bare substring can mistake p-2 for p-20. Check the class-name boundary.
  for (let at = sheet.indexOf(selector); at >= 0; at = sheet.indexOf(selector, at + 1)) {
    if (/[\s:{,]/.test(sheet[at + selector.length] ?? '')) return at
  }
  return -1
}

test('the CSS oracle recognizes flattened states without accepting a longer candidate prefix', () => {
  const css = '.p-20 { padding: 20px; } .p-2:hover { padding: 2px; }'
  assert.equal(selectorOffset(css, '.p-2'), css.lastIndexOf('.p-2'))
  assert.equal(selectorOffset(css, '.p-20'), 0)
  assert.equal(selectorOffset('.p-20 { padding: 20px; }', '.p-2'), -1)
})

test('Rust full rule order matches actual Tailwind CSS for builtin values and overlapping variants', async () => {
  const names = [
    'p-10',
    'p-2',
    'p-20',
    'p-4!',
    'px-2',
    'py-4',
    'pt-4',
    'm-2',
    '-m-4',
    'w-2',
    'w-10',
    'min-w-4',
    'h-4',
    'bg-red-500/50',
    'bg-blue-500',
    'text-lg',
    'font-bold',
    'leading-4',
    'hover:p-2',
    'focus:p-2',
    'focus-visible:p-2',
    'active:p-2',
    'disabled:p-2',
    'hover:focus:p-2',
    'focus:hover:p-2',
    'not-a-generated-utility',
  ]
  const { prepared, sheet, context } = await observe(names)
  const expected = prepared.snapshot.candidates
    .filter((row) => row.rules.length)
    .map((row) => {
      const root = row.rules[0]!.shape
      assert.equal(root.kind, 'rule')
      const at = selectorOffset(sheet, root.selector)
      assert.notEqual(at, -1, `no exact selector for ${row.candidate}`)
      return { candidate: row.candidate, at }
    })
    .sort((a, b) => a.at - b.at)
    .map(({ candidate }) => candidate)
  const result = context.ruleOrder()
  assert.equal(result.fingerprint, prepared.snapshot.fingerprint)
  assert.deepEqual(candidateNames(prepared, result.rules), expected)
  assert.equal(result.rules.length, prepared.snapshot.candidates.flatMap((row) => row.rules).length)
  assert.equal(candidateNames(prepared, result.rules).includes('not-a-generated-utility'), false)
  // It must use complete signatures, not getClassOrder's lossy first rank.
  const changed = JSON.parse(JSON.stringify(prepared.snapshot))
  for (const row of changed.candidates) if (row.firstRuleRank !== null) row.firstRuleRank = '0'
  assert.deepEqual(prepareTailwindContext(JSON.stringify(changed)).ruleOrder(), result)
  result.rules[0]!.ruleId = 999999
  assert.notEqual(
    context.ruleOrder().rules[0]!.ruleId,
    999999,
    'JS copies cannot mutate the native index',
  )
})

test('all rules of duplicate custom utilities match independent CSS markers, including prefix/count/name ties', async () => {
  const definitions = [
    ['proof-short', 'height: 1px'],
    ['proof-prefix', 'height: 1px; width: 1px'],
    ['proof-count', 'height: 1px; --extra: 1'],
    ['proof-2', 'width: 1px'],
    ['proof-02', 'width: 1px'],
    ['proof-10', 'width: 1px'],
    ['proof-dual', 'color: red'],
    ['proof-dual', 'padding: 1px'],
    ['proof-tie', 'width: 1px'],
    ['proof-tie', 'width: 2px'],
  ]
  const additions = definitions
    .map(([name, body], i) => `@utility ${name} { ${body}; --proof-marker-${i}: 1; }`)
    .join('\n')
  const { prepared, sheet, context } = await observe(
    [...new Set(definitions.map(([name]) => name!))],
    additions,
  )
  const markers = (shape): string[] =>
    shape.kind === 'declaration'
      ? shape.property.startsWith('--proof-marker-')
        ? [shape.property]
        : []
      : (shape.nodes ?? []).flatMap(markers)
  const sourceRules = prepared.snapshot.candidates.flatMap((candidate) =>
    candidate.rules.map((rule) => ({ candidate, rule })),
  )
  assert.equal(
    sourceRules.length,
    definitions.length,
    'the oracle must not silently collapse duplicate rules',
  )
  const expected = sourceRules
    .map(({ candidate, rule }) => {
      const marker = markers(rule.shape)
      assert.equal(marker.length, 1)
      const at = sheet.indexOf(`${marker[0]}:`)
      assert.notEqual(at, -1, `Tailwind omitted rule marker ${marker[0]}`)
      return { at, candidateId: candidate.id, ruleId: rule.id }
    })
    .sort((a, b) => a.at - b.at)
    .map(({ at: _at, ...rule }) => rule)
  const result = context.ruleOrder()
  assert.deepEqual(result.rules, expected)
  const ordered = result.rules.map(
    ({ candidateId }) => prepared.snapshot.candidates[candidateId]!.candidate,
  )
  assert.ok(
    ordered.indexOf('proof-prefix') < ordered.indexOf('proof-short'),
    'missing property is Infinity, not vector prefix-first',
  )
  assert.ok(
    ordered.indexOf('proof-count') < ordered.indexOf('proof-short'),
    'declaration count is descending',
  )
  assert.ok(ordered.indexOf('proof-02') < ordered.indexOf('proof-2'))
  assert.ok(ordered.indexOf('proof-2') < ordered.indexOf('proof-10'))
})

test('variant bitsets wider than u128 and empty contexts remain explicit', async () => {
  const { prepared } = await observe(['p-2', 'p-4'])
  const snapshot = JSON.parse(JSON.stringify(prepared.snapshot))
  const [a, b] = snapshot.candidates
  a.rules[0].variantOrder = (1n << 200n).toString()
  b.rules[0].variantOrder = ((1n << 200n) + 1n).toString()
  const result = prepareTailwindContext(JSON.stringify(snapshot)).ruleOrder()
  assert.deepEqual(
    result.rules.map(({ candidateId }) => candidateId),
    [a.id, b.id],
  )
  a.rules[0].variantOrder = ((1n << 220n) + 1n).toString()
  assert.deepEqual(
    prepareTailwindContext(JSON.stringify(snapshot))
      .ruleOrder()
      .rules.map(({ candidateId }) => candidateId),
    [b.id, a.id],
  )
  const empty = { ...snapshot, candidates: [] }
  assert.deepEqual(prepareTailwindContext(JSON.stringify(empty)).ruleOrder(), {
    fingerprint: empty.fingerprint,
    rules: [],
  })
})
