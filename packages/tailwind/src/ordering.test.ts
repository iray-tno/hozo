import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { ExecutableStylesheetError } from './static-css.ts'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

const base = tailwindPackageDir()
const css = readFileSync(path.join(base, 'theme.css'), 'utf8')

test('prepared rule IDs are deterministic, JSON-safe, immutable and synchronous to consume', async () => {
  const names = ['p-2', 'hover:p-4', 'focus:p-4', 'active:p-4', 'notautility']
  const prepared = await prepareTailwindOrder(css, base, names)
  const reversed = await prepareTailwindOrder(css, base, [...names].reverse().concat('p-2'))
  assert.deepEqual(prepared.snapshot, reversed.snapshot)
  assert.deepEqual(JSON.parse(JSON.stringify(prepared.snapshot)), prepared.snapshot)
  assert.match(prepared.snapshot.fingerprint, /^[a-f0-9]{64}$/)
  const p2 = prepared.lookup('p-2')!
  assert.equal(p2, prepared.lookup('p-2'))
  assert.equal(p2, prepared.snapshot.candidates[p2.id])
  assert.equal(p2.status, 'described')
  assert.equal(prepared.lookup('notautility')?.status, 'not-generated')
  assert.equal(prepared.lookup('notautility')?.firstRuleRank, null)
  assert.deepEqual(prepared.lookup('notautility')?.rules, [])
  assert.equal(prepared.lookup('p-99'), null, 'uncollected is not the same as not generated')
  assert.throws(
    () => Reflect.apply(Array.prototype.push, p2.rules[0]!.propertyOrder, [999]),
    TypeError,
  )
  assert.throws(
    () =>
      Object.defineProperty(prepared.snapshot.candidates[0]!, 'candidate', { value: 'changed' }),
    TypeError,
  )
  assert.throws(
    () => Object.defineProperty(prepared.snapshot.stylesheets[0]!, 'sha256', { value: 'changed' }),
    TypeError,
  )
  const rules = prepared.snapshot.candidates.flatMap((entry) => entry.rules)
  assert.deepEqual(
    rules.map((rule) => rule.id),
    rules.map((_, i) => i),
  )
  for (const rule of rules)
    assert.ok(prepared.snapshot.candidates[rule.candidateId]!.rules.includes(rule))
  const variant = (name: string) => BigInt(prepared.lookup(name)!.rules[0]!.variantOrder)
  assert.equal(variant('p-2'), 0n)
  assert.ok(variant('hover:p-4') < variant('focus:p-4'))
  assert.ok(variant('focus:p-4') < variant('active:p-4'))
})

test('one candidate retains multiple rules, compound declarations, importance and nested selectors', async () => {
  const multiCss = `${css}
@utility order-multi { padding: 1px; }
@utility order-multi { color: red; }`
  const context = await prepareTailwindOrder(multiCss, base, [
    'order-multi',
    'text-lg/6',
    'hover:focus:p-4',
    'p-2!',
    'placeholder:text-red-500',
  ])
  const multi = context.lookup('order-multi')!
  assert.equal(multi.rules.length, 2)
  assert.notDeepEqual(multi.rules[0]!.propertyOrder, multi.rules[1]!.propertyOrder)
  assert.equal(context.lookup('text-lg/6')!.rules[0]!.declarationCount, 2)
  assert.equal(context.lookup('p-2!')!.rules[0]!.important, true)
  const tree = context.lookup('hover:focus:p-4')!.rules[0]!.shape
  assert.equal(tree.kind, 'rule')
  assert.equal(tree.kind === 'rule' && tree.nodes[0]!.kind, 'rule')
  assert.match(JSON.stringify(tree), /@media/)
  assert.match(JSON.stringify(tree), /&:focus/)
  assert.match(JSON.stringify(context.lookup('placeholder:text-red-500')), /::placeholder/)
})

test('imported edits and universe additions invalidate the entire namespace without stale cache reads', async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-order-context-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const imported = path.join(root, 'tokens.css')
  const input = '@import "./tokens.css";'
  const prepare = (names = ['p-2']) =>
    prepareTailwindOrder(input, root, names, { file: path.join(root, 'entry.css') })
  writeFileSync(imported, '@theme { --spacing: 0.25rem; }')
  const first = await prepare()
  assert.equal(first.snapshot.stylesheets.length, 2)
  writeFileSync(imported, '@theme { --spacing: 0.5rem; }')
  const second = await prepare()
  assert.notEqual(first.snapshot.fingerprint, second.snapshot.fingerprint)
  // Property signature alone is unchanged; the complete input receipt is not.
  assert.deepEqual(first.lookup('p-2')!.rules, second.lookup('p-2')!.rules)
  const third = await prepare(['p-2', 'focus:p-2'])
  assert.notEqual(second.snapshot.fingerprint, third.snapshot.fingerprint)
  assert.equal(second.lookup('focus:p-2'), null)
  assert.equal(third.lookup('focus:p-2')!.status, 'described')
  assert.equal(first.lookup('p-2')!.status, 'described', 'old contexts remain immutable')
})

test('variant definitions are part of the receipt, not just candidate names', async () => {
  const first = await prepareTailwindOrder(`${css}\n@custom-variant ready (&[data-ready]);`, base, [
    'ready:p-2',
  ])
  const second = await prepareTailwindOrder(
    `${css}\n@custom-variant ready (&[aria-selected="true"]);`,
    base,
    ['ready:p-2'],
  )
  assert.notEqual(first.snapshot.fingerprint, second.snapshot.fingerprint)
  assert.notDeepEqual(
    first.lookup('ready:p-2')!.rules[0]!.shape,
    second.lookup('ready:p-2')!.rules[0]!.shape,
  )
})

test('empty universes stay explicit and stylesheet-wide importance is retained', async () => {
  const empty = await prepareTailwindOrder(css, base, [])
  assert.deepEqual(empty.snapshot.candidates, [])
  assert.equal(empty.lookup('p-2'), null)
  const important = await prepareTailwindOrder('@import "tailwindcss" important;', base, ['p-2'])
  assert.equal(important.lookup('p-2')!.rules[0]!.important, true)
  assert.ok(important.snapshot.stylesheets.length > 1)
})

test('async preparation captures the collected universe before caller mutation', async () => {
  const names = ['p-2']
  const pending = prepareTailwindOrder(css, base, names)
  names.push('p-4')
  const prepared = await pending
  assert.equal(prepared.lookup('p-2')!.status, 'described')
  assert.equal(prepared.lookup('p-4'), null)
})

test('unsafe and incomplete inputs fail preparation instead of producing a fallback rank context', async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-order-safe-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  writeFileSync(path.join(root, 'config.cjs'), 'throw new Error("must never execute")')
  const imported = path.join(root, 'tokens.css')
  for (const directive of ['@config "./config.cjs";', '@plugin "./config.cjs";']) {
    await assert.rejects(prepareTailwindOrder(directive, root, ['p-2']), ExecutableStylesheetError)
    writeFileSync(imported, directive)
    await assert.rejects(
      prepareTailwindOrder('@import "./tokens.css";', root, ['p-2']),
      ExecutableStylesheetError,
    )
  }
  await assert.rejects(prepareTailwindOrder('@import "./missing.css";', root, ['p-2']), /ENOENT/)
  await assert.rejects(
    prepareTailwindOrder('@import "https://example.invalid/input.css";', root, ['p-2']),
    ExecutableStylesheetError,
  )
})
