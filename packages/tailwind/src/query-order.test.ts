import assert from 'node:assert/strict'
import test from 'node:test'
import { createCompiler, openCandidateCache, prepareFinalTailwindContext } from '@hozo/compiler'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

// #1230. A rule inside `@media`, `@container` or `@supports` weighs what its
// unprefixed twin weighs, so it wins by coming later. Tailwind always emits
// it later; Hozo emitted it where it was written, so `md:p-4 p-2` let the
// base win at every width.
const css =
  '@theme {--spacing:.25rem; --breakpoint-md:48rem; --breakpoint-lg:64rem; --container-md:28rem;} @tailwind utilities;'
const queries = [
  'md:p-4',
  'max-md:p-4',
  'min-[600px]:p-4',
  'dark:p-4',
  'print:p-4',
  'motion-safe:p-4',
  'portrait:p-4',
  'pointer-coarse:p-4',
  '@md:p-4',
  '@max-md:p-4',
  'supports-[display:grid]:p-4',
  'md:hover:p-4',
  'dark:focus:p-4',
]
const pairs = [...queries.map((query) => [query, 'p-2']), ['lg:p-8', 'md:p-4']]

const source = (classes: string) =>
  `import {Pressable} from '@hozo/core';export const A=()=> <Pressable className="${classes}"/>`

async function context() {
  const names = [...new Set(pairs.flat())]
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), names)
  return prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
}

test('a query rule follows the unprefixed rule in either authored order, as Tailwind emits it', async () => {
  const compiler = createCompiler()
  const final = await context()
  for (const [later, earlier] of pairs) {
    const outputs = [
      [later, earlier],
      [earlier, later],
    ].map((names) => compiler.prepareWebModule(source(names.join(' '))).emit(final)[0]!)
    for (const web of outputs) {
      assert.deepEqual(web.diagnostics, [], later)
    }
    // The order the two were written in no longer changes the sheet.
    assert.equal(outputs[0]!.css, outputs[1]!.css, `${later} / ${earlier}`)
    const sheet = outputs[0]!.css
    const value = (name: string) => `${Number(name.split('-').at(-1)) * 4}px`
    assert.ok(
      sheet.lastIndexOf(`padding-top: ${value(earlier!)}`) <
        sheet.lastIndexOf(`padding-top: ${value(later!)}`),
      `${later} after ${earlier}:\n${sheet}`,
    )
  }
})

test('Native static output and the dynamic candidate plan rank the same queries', async () => {
  const compiler = createCompiler()
  const final = await context()
  for (const [later, earlier] of pairs) {
    const [first, second] = [
      [later, earlier],
      [earlier, later],
    ].map(
      (names) => compiler.prepareNativeModule(source(names.join(' '))).emit(final).components[0]!,
    )
    // Queries Native cannot answer are reported, the same in both orders.
    assert.deepEqual(first!.diagnostics, second!.diagnostics, later)
    if (first!.diagnostics.length === 0) {
      assert.equal(first!.styles, second!.styles, later)
      assert.equal(first!.jsx, second!.jsx, later)
    }
  }
  const cache = openCandidateCache()
  const names = [...new Set(pairs.flat())]
  cache.scanFile('queries.ts', JSON.stringify(names.join(' ')), 0)
  const plan = cache.renderNativeModulePlan(final)
  // The dynamic Native map generates no query candidate at all, so ranking
  // the static path opens no static/dynamic disagreement. When it starts
  // generating them, this fails and they must be ranked by the same
  // boundary rather than left in authored order.
  for (const entry of plan.entries) {
    if (entry.candidate === 'p-2') continue
    assert.equal(entry.kind, 'refused', entry.candidate)
    assert.equal(entry.reason, 'unsupported-condition-or-property', entry.candidate)
  }
})
