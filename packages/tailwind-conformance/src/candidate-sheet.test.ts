import assert from 'node:assert/strict'
import { test } from 'node:test'

import { openCandidateCache } from '@hozo/compiler'
import { loadClassOrder } from '@hozo/tailwind'

import { compareCandidateSheet } from './candidate-sheet.ts'
import { buildOracle } from './oracle.ts'
import { tailwindPackageDir } from './theme.ts'

const CANDIDATES = [
  'flex',
  'hidden',
  'p-4',
  'sm:block',
  'md:hidden',
  'lg:block',
  'xl:hidden',
  '2xl:block',
]

/** The sheet Hozo writes for these, and the one Tailwind writes. */
async function sheets() {
  const cache = openCandidateCache()
  cache.scanFile('a.tsx', `const all = ${JSON.stringify(CANDIDATES.join(' '))}`, 1)
  const held = cache.candidates()
  const order = await loadClassOrder('@import "tailwindcss";', tailwindPackageDir(), held)
  const oracle = await buildOracle([...held])
  return { cache, held, order, oracleCss: oracle.css }
}

test('the sheet Hozo writes today parses and is in Tailwind order', async () => {
  const { cache, held, order, oracleCss } = await sheets()
  const report = compareCandidateSheet(cache.renderCss(undefined, order), oracleCss, held)
  assert.equal(report.parseError, undefined)
  assert.equal(report.inOrder, report.comparable)
  assert.ok(report.comparable >= CANDIDATES.length, 'the comparison lost candidates')
})

test('a selector CSS rejects is reported, not passed over', async () => {
  // `.2xl\:block` is what Hozo used to write: CSS cannot begin an
  // identifier with a digit, so the rule matched nothing in a browser and
  // a minifier refused the file. Reproduced by undoing the escape rather
  // than by hand-writing a broken sheet, so what is under test is the
  // shape the compiler actually produced.
  const { cache, held, order, oracleCss } = await sheets()
  const css = cache.renderCss(undefined, order)
  assert.match(css, /\\32 xl\\:block/, 'nothing in this sheet exercises the escape')

  const broken = css.replaceAll(/\\3(\d) /g, '$1')
  const report = compareCandidateSheet(broken, oracleCss, held)
  assert.ok(report.parseError, 'a stylesheet no browser can read was reported as fine')
})

test('alphabetical order is reported as the divergence it is', async () => {
  // What `union()` gives, and what shipped: `2xl:` first and `sm:` after
  // `md:`. Every rule here is a single class, so the order is the cascade
  // and `hidden sm:block md:hidden` stayed visible past `md`.
  const { cache, held, oracleCss } = await sheets()
  const report = compareCandidateSheet(cache.renderCss(undefined), oracleCss, held)
  assert.notEqual(report.inOrder, report.comparable, 'alphabetical passed as Tailwind order')
  assert.ok(report.firstDivergence, 'a divergence was counted but not named')
  // Still valid CSS, which is the point of asking both questions: the
  // parser has nothing to say about an order.
  assert.equal(report.parseError, undefined)
})
