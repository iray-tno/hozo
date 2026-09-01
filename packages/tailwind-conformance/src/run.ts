// Prints the conformance report: per-group coverage and fidelity, plus
// every individual mismatch. `pnpm --filter @hozo/tailwind-conformance report`
//
// With `--check`, also compares every headline number against
// `snapshot.json` and exits 1 on any change. That is what makes this a
// check rather than a thing someone remembers to read -- see
// `./snapshot.ts` for why a snapshot and not a set of thresholds.

import { compileNative, compile as hozoCompile, openCandidateCache } from '@hozo/compiler'
import { loadClassOrder } from '@hozo/tailwind'
import {
  A11Y_CONTEXTUAL_CASES,
  CONTRACT_EXEMPT,
  compareA11yContextual,
  primitivesUnderContract,
} from './a11y-contextual.ts'
import { buildArbitraryCatalog } from './arbitrary-catalog.ts'
import { ariaRoleCases, compareAriaRole } from './aria-roles.ts'
import { auditRefusal, type RefusalAudit, type RefusalVerdict } from './audit.ts'
import { compareCandidateSheet } from './candidate-sheet.ts'
import { ALL_CANDIDATES, CANDIDATE_GROUPS, stripVariant } from './candidates.ts'
import { type CanvasVerdict, compareCanvasCandidate } from './canvas.ts'
import { loadFullCatalog, namespaceOf } from './catalog.ts'
import { type Comparison, compareCandidate, type SkipReason, type Verdict } from './compare.ts'
import { buildComposedCatalog } from './composed.ts'
import { buildCompositionCatalog } from './compositions.ts'
import {
  compareDiagnostic,
  type DiagnosticVerdict,
  declaredDiagnosticCodes,
} from './diagnostics.ts'
import { compareNativeCandidate, type NativeComparison, type NativeVerdict } from './native.ts'
import { compareNativeContextual, NATIVE_CONTEXTUAL_CASES } from './native-contextual.ts'
import {
  compareNativeGridContextual,
  NATIVE_GRID_CONTEXTUAL_CASES,
} from './native-grid-contextual.ts'
import { reactNativeCssProperties, reactNativeVersion } from './native-surface.ts'
import { buildOracle } from './oracle.ts'
import { declaredPrimitives } from './primitives.ts'
import { classesDefinedIn, renderWeb } from './render.ts'
import { compareRnwFree, RNW_FREE_CASES } from './rnw-free.ts'
import { measureRuntimeCost } from './runtime-cost.ts'
import { finish, record } from './snapshot.ts'
import { stylexPracticalScorecard } from './stylex-practical.ts'
import { stylexSurface, stylexVersion } from './stylex-surface.ts'
import { loadThemeVars, tailwindPackageDir, tailwindVersion } from './theme.ts'
import { typeCheckStyles } from './typecheck.ts'
import { buildVariantCatalog, compareVariant } from './variants.ts'

const oracle = await buildOracle(ALL_CANDIDATES)
// Theme values plus the `@property` register defaults the utilities
// reference without a fallback -- both needed to resolve Tailwind's output.
const vars = new Map([...loadThemeVars(), ...oracle.registerDefaults])

const results = new Map<string, Comparison[]>()
for (const [group, candidates] of Object.entries(CANDIDATE_GROUPS)) {
  results.set(
    group,
    candidates.map((candidate) => compareCandidate(candidate, oracle.rules.get(candidate), vars)),
  )
}

const all = [...results.values()].flat()
const count = (verdict: string, list: Comparison[] = all) =>
  list.filter((r) => r.verdict === verdict).length
const pct = (n: number, d: number) => (d === 0 ? '--' : `${((n / d) * 100).toFixed(1)}%`)

console.log(`Tailwind conformance vs tailwindcss v${tailwindVersion()}\n`)
// In the snapshot as well as the output. A version bump legitimately
// moves these numbers, and the diff should carry the reason beside them
// rather than leave someone to work out why 20222 became 20240.
record('versions', {
  tailwind: tailwindVersion(),
  reactNative: reactNativeVersion(),
  stylex: stylexVersion(),
})

const stylex = stylexSurface()
console.log('== StyleX static property-name surface ==')
console.log(
  `All CSS names:       ${stylex.mapped.size}/${stylex.official.size} = ${pct(stylex.mapped.size, stylex.official.size)}`,
)
console.log(
  `Universal names:     ${stylex.mappedNative.size}/${stylex.native.size} = ${pct(stylex.mappedNative.size, stylex.native.size)}`,
)
console.log(
  `Contextual names:    ${stylex.mappedContextual.size}/${stylex.contextual.size} = ${pct(stylex.mappedContextual.size, stylex.contextual.size)}`,
)
console.log(
  `Adapter names:       ${stylex.mappedAdapter.size}/${stylex.adapter.size} = ${pct(stylex.mappedAdapter.size, stylex.adapter.size)}`,
)
console.log(
  `Web-only names:      ${stylex.mappedWebOnly.size}/${stylex.webOnly.size} = ${pct(stylex.mappedWebOnly.size, stylex.webOnly.size)}`,
)
console.log('These are property-name upper bounds; accepted values and StyleX APIs are narrower.\n')
record('stylex', {
  properties: stylex.official.size,
  mapped: stylex.mapped.size,
  nativeProperties: stylex.native.size,
  mappedNative: stylex.mappedNative.size,
  contextualProperties: stylex.contextual.size,
  mappedContextual: stylex.mappedContextual.size,
  adapterProperties: stylex.adapter.size,
  mappedAdapter: stylex.mappedAdapter.size,
  webOnlyProperties: stylex.webOnly.size,
  mappedWebOnly: stylex.mappedWebOnly.size,
})
const stylexPractical = stylexPracticalScorecard()
console.log('== StyleX practical compatibility ==')
console.log(
  `Representative values: ${stylexPractical.values.covered}/${stylexPractical.values.total} = ${pct(stylexPractical.values.covered, stylexPractical.values.total)}`,
)
console.log(
  `Authoring constructs:  ${stylexPractical.constructs.covered}/${stylexPractical.constructs.total} = ${pct(stylexPractical.constructs.covered, stylexPractical.constructs.total)}`,
)
console.log(
  `Scenario declarations: ${stylexPractical.corpus.covered}/${stylexPractical.corpus.total} = ${pct(stylexPractical.corpus.covered, stylexPractical.corpus.total)}`,
)
console.log(`Silent failures:       ${stylexPractical.silent}\n`)
record('stylexValues', {
  cases: stylexPractical.values.total,
  covered: stylexPractical.values.covered,
})
record('stylexConstructs', {
  cases: stylexPractical.constructs.total,
  covered: stylexPractical.constructs.covered,
})
record('stylexCorpus', {
  cases: stylexPractical.corpus.total,
  covered: stylexPractical.corpus.covered,
})
record('stylexSafety', {
  silent: stylexPractical.silent,
})
console.log('== Web (hozo_web) ==')
// Stated up front so the Web numbers can't be read as covering both
// backends: Tailwind only exists as CSS, so it can only be an oracle for
// the Web lowering. The Native section below measures coverage only.

const rows = [...results.entries()].map(([group, list]) => {
  const comparable = list.length - count('SKIPPED', list)
  return {
    group,
    total: list.length,
    supported: `${list.length - count('UNSUPPORTED', list) - count('SKIPPED', list)}/${comparable}`,
    match: count('MATCH', list),
    mismatch: count('MISMATCH', list),
    unsupported: count('UNSUPPORTED', list),
    skipped: count('SKIPPED', list),
  }
})
console.table(rows)

const comparable = all.length - count('SKIPPED')
const supported = count('MATCH') + count('MISMATCH')
console.log(
  `Candidates:  ${all.length}   (comparable: ${comparable}, skipped: ${count('SKIPPED')})`,
)
console.log(
  `Coverage:    ${supported}/${comparable} = ${pct(supported, comparable)}  (Hozo emits something)`,
)
console.log(
  `Fidelity:    ${count('MATCH')}/${supported} = ${pct(count('MATCH'), supported)}  (of those, matches Tailwind exactly)`,
)
record('web', {
  candidates: all.length,
  comparable,
  coverage: supported,
  fidelity: count('MATCH'),
  skipped: count('SKIPPED'),
})

const mismatches = all.filter((r) => r.verdict === 'MISMATCH')
if (mismatches.length > 0) {
  console.log(`\nMismatches (${mismatches.length}):`)
  for (const m of mismatches) {
    const { variant } = stripVariant(m.candidate)
    console.log(`  ${m.candidate}${variant ? ` [variant: ${variant}]` : ''}\n    ${m.detail}`)
  }
}

const unsupported = [...results.entries()]
  .map(([group, list]) => [group, list.filter((r) => r.verdict === 'UNSUPPORTED')] as const)
  .filter(([, list]) => list.length > 0)
if (unsupported.length > 0) {
  const total = unsupported.reduce((n, [, list]) => n + list.length, 0)
  console.log(`\nUnsupported (${total}) -- coverage gaps, by group:`)
  for (const [group, list] of unsupported) {
    console.log(`  ${group}: ${list.map((r) => r.candidate).join(' ')}`)
  }
}

const accepted = all.filter((r) => r.verdict === 'MATCH' && r.detail)
if (accepted.length > 0) {
  console.log(`\nAccepted differences (${accepted.length}) -- counted as matches:`)
  for (const a of accepted) {
    console.log(`  ${a.candidate}: ${a.detail}`)
  }
}

const skipped = all.filter((r) => r.verdict === 'SKIPPED')
if (skipped.length > 0) {
  console.log(`\nSkipped (${skipped.length}) -- no claim made either way:`)
  for (const s of skipped) {
    console.log(`  ${s.candidate}: ${s.detail}`)
  }
}

// ---------------------------------------------------------------------------
// Native
// ---------------------------------------------------------------------------

console.log('\n\n== Native (hozo_native) ==')
console.log('Coverage only: Tailwind is CSS, so there is no oracle to check fidelity against.')
console.log('REFUSED is a known gap named at build time; SILENT is one nothing reports.\n')

const nativeResults = new Map<string, NativeComparison[]>()
for (const [group, candidates] of Object.entries(CANDIDATE_GROUPS)) {
  nativeResults.set(group, candidates.map(compareNativeCandidate))
}
const nativeAll = [...nativeResults.values()].flat()
const nativeCount = (verdict: NativeVerdict, list: NativeComparison[] = nativeAll) =>
  list.filter((r) => r.verdict === verdict).length

console.table(
  [...nativeResults.entries()].map(([group, list]) => ({
    group,
    total: list.length,
    covered: nativeCount('COVERED', list),
    restricted: list.filter((r) => r.restrictedTo).length,
    refused: nativeCount('REFUSED', list),
    silent: nativeCount('SILENT', list),
    noOp: nativeCount('NO_OP', list),
  })),
)

console.log(
  `Coverage:    ${nativeCount('COVERED')}/${nativeAll.length} = ` +
    `${pct(nativeCount('COVERED'), nativeAll.length)}  (Hozo emits a style)`,
)
console.log(
  `Refused:     ${nativeCount('REFUSED')}   (named at build time; error, or warning where the ` +
    `gap is unbuilt rather than impossible)\n` +
    `Silent:      ${nativeCount('SILENT')}   (no style, no diagnostic -- the one that has to stay at zero)\n` +
    `No-op:       ${nativeCount('NO_OP')}   (React Native already does this, so there is nothing to emit)`,
)
record('native', {
  candidates: nativeAll.length,
  covered: nativeCount('COVERED'),
  refused: nativeCount('REFUSED'),
  silent: nativeCount('SILENT'),
  noOp: nativeCount('NO_OP'),
})

const noOps = nativeAll.filter((r) => r.verdict === 'NO_OP')
if (noOps.length > 0) {
  console.log(`\nNo-op (${noOps.length}) -- honoured by doing nothing, not dropped:`)
  for (const n of noOps) {
    console.log(`  ${n.candidate}: ${n.detail}`)
  }
}

const restricted = nativeAll.filter((r) => r.restrictedTo)
if (restricted.length > 0) {
  console.log(
    `\nRestricted (${restricted.length}) -- counted as covered, but only where listed;` +
      `\nusing them elsewhere is a build error:`,
  )
  for (const r of restricted) {
    console.log(`  ${r.candidate}: ${r.restrictedTo!.join(', ')} only`)
  }
}

const refusedByGroup = [...nativeResults.entries()]
  .map(([group, list]) => [group, list.filter((r) => r.verdict === 'REFUSED')] as const)
  .filter(([, list]) => list.length > 0)
if (refusedByGroup.length > 0) {
  console.log('\nRefused, by group:')
  for (const [group, list] of refusedByGroup) {
    console.log(`  ${group}: ${list.map((r) => r.candidate).join(' ')}`)
  }
}

const silent = nativeAll.filter((r) => r.verdict === 'SILENT')
if (silent.length > 0) {
  console.log(`\nSilent (${silent.length}) -- these compile to nothing without saying so:`)
  for (const s of silent) {
    console.log(`  ${s.candidate}: ${s.detail}`)
  }
}

const contextual = NATIVE_CONTEXTUAL_CASES.map(compareNativeContextual)
const contextualCovered = contextual.filter((result) => result.verdict === 'COVERED').length
console.log(
  `\nNative contextual transitions: ${contextualCovered}/${contextual.length} = ` +
    `${pct(contextualCovered, contextual.length)}  (configuration plus an interactive target)`,
)
for (const result of contextual) {
  console.log(
    `  ${result.candidate}: ${result.verdict} -- ${result.purpose}` +
      (result.detail ? ` (${result.detail})` : ''),
  )
}

const contextualGrid = NATIVE_GRID_CONTEXTUAL_CASES.map(compareNativeGridContextual)
const contextualGridCovered = contextualGrid.filter((result) => result.verdict === 'COVERED').length
console.log(
  `\nNative contextual grid: ${contextualGridCovered}/${contextualGrid.length} = ` +
    `${pct(contextualGridCovered, contextualGrid.length)}  (container tracks plus child placement)`,
)
for (const result of contextualGrid) {
  console.log(
    `  ${result.name}: ${result.verdict} -- ${result.purpose}` +
      (result.detail ? ` (${result.detail})` : ''),
  )
}

const contextualA11y = A11Y_CONTEXTUAL_CASES.map(compareA11yContextual)
const contextualA11yCovered = contextualA11y.filter((result) => result.covered).length
console.log(
  `\nCross-platform accessibility contracts: ${contextualA11yCovered}/${contextualA11y.length} = ` +
    `${pct(contextualA11yCovered, contextualA11y.length)}  (semantics plus required diagnostics)`,
)
// Recorded, which it was not. These printed `MISMATCH` beside a coverage
// figure and reached no exit path at all: `run.ts` has no `throw` and no
// `process.exit`, and the only gate is the snapshot comparing numbers that
// were handed to `record`. Verified by breaking one -- the line said
// `MISMATCH`, the figure fell to 12/13, and the audit finished with
// "Snapshot matches. Nothing moved." and exit 0.
//
// The accessibility contracts are the last place that should hold, and
// they were the one place a regression printed itself and passed.
// Which primitives have a contract at all, against the enum that declares
// them. The expectations above cannot be derived -- what `<Nav>` becomes
// on each platform is Hozo's decision and appears in no specification --
// but the coverage can, and that is the half that goes stale. It had:
// `FlatList`, `ScrollView`, `Svg` and `View` were declared primitives with
// no contract, and the only thing that would ever have said so was
// somebody noticing.
const primitives = declaredPrimitives()
const underContract = primitivesUnderContract()
const uncontracted = primitives.filter(
  (primitive) => !underContract.has(primitive) && !(primitive in CONTRACT_EXEMPT),
)
console.log(
  `  primitives ${primitives.length}, without a contract ${uncontracted.length}` +
    (uncontracted.length > 0 ? `: ${uncontracted.join(' ')}` : ''),
)
record('a11yContracts', {
  cases: contextualA11y.length,
  covered: contextualA11yCovered,
  primitives: primitives.length,
  uncontracted: uncontracted.length,
})
for (const result of contextualA11y) {
  console.log(
    `  ${result.name}: ${result.covered ? 'COVERED' : 'MISMATCH'} -- ${result.purpose}` +
      (result.detail ? ` (${result.detail})` : ''),
  )
}

const rnwFree = RNW_FREE_CASES.map(compareRnwFree)
const rnwFreeCovered = rnwFree.filter((result) => result.covered).length
console.log(
  `\nRNW-free primitive contract: ${rnwFreeCovered}/${rnwFree.length} = ` +
    `${pct(rnwFreeCovered, rnwFree.length)}  (direct DOM and Native/runtime lowering)`,
)
// Every concrete role in the specification, written correctly, asked
// whether the compiler complains. The seven accessibility diagnostics had
// no denominator at all -- not one of them appeared in this package -- so
// the half that decides whether anyone leaves them switched on was
// unmeasured. A check that cries wolf gets turned off, and the real
// findings go with it. See `aria-roles.ts`.
const ariaRoles = ariaRoleCases().map(compareAriaRole)
const ariaComplaints = ariaRoles.filter((result) => result.verdict === 'COMPLAINED')
// Two families. The static one is every concrete role written correctly;
// the interactive one is the roles the specification calls widgets, given
// a press handler, `tabIndex={0}` and an id of their own -- because four
// diagnostics cannot be reached without those, and a correctly-written
// role carries none of them.
const ariaFamily = (family: 'static' | 'interactive') =>
  ariaRoles.filter((result) => result.family === family)
console.log(
  `\nARIA roles written correctly: ${ariaRoles.length}   ` +
    `false positives: ${ariaComplaints.length}   (has to be zero)\n` +
    `  static       ${ariaFamily('static').length}\n` +
    `  interactive  ${ariaFamily('interactive').length}`,
)
for (const result of ariaComplaints) {
  console.log(`  ${result.family.padEnd(12)} ${result.role.padEnd(20)} ${result.codes.join(', ')}`)
}
record('ariaRoles', {
  roles: ariaRoles.length,
  staticRoles: ariaFamily('static').length,
  interactiveRoles: ariaFamily('interactive').length,
  falsePositives: ariaComplaints.length,
})

// The other half. The section above asks whether the checks stay quiet on
// correct code; this asks whether they speak at all -- which is the half
// that can rot invisibly, because a check that stopped firing looks exactly
// like a codebase with no defects in it. Every diagnostic in this compiler
// could be replaced with `return` today and nothing else here would move.
const diagnosticCodes = declaredDiagnosticCodes()
const diagnostics = diagnosticCodes.map(compareDiagnostic)
const diagnosticCount = (verdict: DiagnosticVerdict) =>
  diagnostics.filter((result) => result.verdict === verdict).length
console.log(
  `\nDiagnostics the compiler declares: ${diagnosticCodes.length}\n` +
    `  fire when provoked  ${diagnosticCount('FIRES')}\n` +
    `  stayed silent       ${diagnosticCount('SILENT')}   (has to be zero)\n` +
    `  no case written     ${diagnosticCount('NO_CASE')}   (has to be zero)\n` +
    `  unreachable by design ${diagnosticCount('UNREACHABLE')}`,
)
for (const result of diagnostics) {
  if (result.verdict === 'FIRES') continue
  const detail = result.reason ?? `raised: ${result.raised.join(', ') || 'nothing'}`
  console.log(`  ${result.verdict.padEnd(12)} ${result.code.padEnd(32)} ${detail}`)
}
record('diagnostics', {
  declared: diagnosticCodes.length,
  fires: diagnosticCount('FIRES'),
  silent: diagnosticCount('SILENT'),
  noCase: diagnosticCount('NO_CASE'),
  unreachable: diagnosticCount('UNREACHABLE'),
})

record('rnwFree', { cases: rnwFree.length, covered: rnwFreeCovered })
for (const result of rnwFree) {
  console.log(
    `  ${result.primitive}: ${result.covered ? 'COVERED' : 'MISMATCH'}` +
      (result.detail ? ` (${result.detail})` : ''),
  )
}

// ---------------------------------------------------------------------------
// Full catalogue
// ---------------------------------------------------------------------------
//
// The number above is measured against a list we chose. This one is
// measured against Tailwind's own, asked for through the same entry point
// its IntelliSense extension uses -- so it can't be flattered by picking
// the utilities Hozo happens to implement.

console.log('\n\n== Full catalogue (Tailwind enumerates its own surface) ==')

const catalog = (await loadFullCatalog()).filter((c) => !c.includes('"'))
const fullOracle = await buildOracle(catalog)
const fullVars = new Map([...loadThemeVars(), ...fullOracle.registerDefaults])

interface NamespaceRow {
  total: number
  match: number
  mismatch: number
  unsupported: number
  skipped: number
}

const catalogCounts: Record<Verdict, number> = {
  MATCH: 0,
  MISMATCH: 0,
  UNSUPPORTED: 0,
  SKIPPED: 0,
  COMPOSITION_ONLY: 0,
}
const byNamespace = new Map<string, NamespaceRow>()
// Entries Tailwind lists but produces no standalone CSS for -- a gradient
// stop with no gradient, a negative form of something that takes no
// negative. There is nothing for Hozo to cover, so they leave the
// denominator. Tailwind decides this, not us.
//
// `COMPOSITION_ONLY` is the same situation one step later: Tailwind emits a
// rule, but it only sets a custom property and paints nothing (`ring-blue-500`
// is the colour a ring renders in, inert until a `ring-2` exists to paint).
// A one-utility comparison can't measure those either, so they leave too.
let notEmittedByTailwind = 0

for (const candidate of catalog) {
  const expected = fullOracle.rules.get(candidate)
  if (expected === undefined) {
    notEmittedByTailwind += 1
    continue
  }
  const result = compareCandidate(candidate, expected, fullVars)
  catalogCounts[result.verdict] += 1
  const ns = namespaceOf(candidate)
  const row = byNamespace.get(ns) ?? { total: 0, match: 0, mismatch: 0, unsupported: 0, skipped: 0 }
  row.total += 1
  if (result.verdict === 'MATCH') row.match += 1
  if (result.verdict === 'MISMATCH') row.mismatch += 1
  if (result.verdict === 'UNSUPPORTED') row.unsupported += 1
  if (result.verdict === 'SKIPPED') row.skipped += 1
  byNamespace.set(ns, row)
}

const catalogComparable = catalog.length - notEmittedByTailwind - catalogCounts.COMPOSITION_ONLY
console.log(
  `Catalogue:   ${catalog.length} entries. ${notEmittedByTailwind} produce no rule at all from ` +
    `Tailwind and\n             ${catalogCounts.COMPOSITION_ONLY} produce one that paints nothing ` +
    `until combined with another utility;\n             neither is measurable one utility at a ` +
    `time, leaving ${catalogComparable}.\n`,
)
console.log(
  `Match:       ${catalogCounts.MATCH}/${catalogComparable} = ${pct(catalogCounts.MATCH, catalogComparable)}\n` +
    `Mismatch:    ${catalogCounts.MISMATCH}\n` +
    `Unsupported: ${catalogCounts.UNSUPPORTED}   (Hozo emits nothing)\n` +
    `Skipped:     ${catalogCounts.SKIPPED}   (one side wouldn't resolve; no claim made)`,
)
record('catalogue', {
  entries: catalog.length,
  comparable: catalogComparable,
  match: catalogCounts.MATCH,
  mismatch: catalogCounts.MISMATCH,
  unsupported: catalogCounts.UNSUPPORTED,
  skipped: catalogCounts.SKIPPED,
})
console.log(
  '\nRead the percentage with the shape in mind: value expansion dominates it.\n' +
    'Covering bg-blue-500 and bg-blue-600 is one code path, and mask-* alone is\n' +
    'over a quarter of the catalogue. The namespace table is the actionable view.',
)

const nsRows = [...byNamespace.entries()].sort((a, b) => b[1].total - a[1].total)
console.log('\nLargest namespaces:')
console.table(
  nsRows.slice(0, 20).map(([namespace, row]) => ({
    namespace,
    total: row.total,
    match: row.match,
    mismatch: row.mismatch,
    unsupported: row.unsupported,
    skipped: row.skipped,
  })),
)
const untouched = nsRows.filter(([, r]) => r.match === 0)
console.log(
  `Namespaces: ${nsRows.length} total, ` +
    `${nsRows.filter(([, r]) => r.match === r.total).length} fully matching, ` +
    `${untouched.length} with nothing matching.`,
)

// ---------------------------------------------------------------------------
// The candidate stylesheet, whole
// ---------------------------------------------------------------------------
//
// Every section above asks about one utility. Two defects shipped under a
// green audit in the same week because neither is a question about one:
// `.2xl\:block` is not a selector CSS accepts, and the rules came out in
// alphabetical order, which for a sheet where every rule is a single class
// *is* the cascade -- `sm:block` outranked `md:hidden` and
// `hidden sm:block md:hidden` stayed visible past `md`.
//
// Only this stylesheet spells a Tailwind class name. A class the compiler
// reads statically becomes `hozo-N`, so the variant section compiles
// `<View className="2xl:block" />` and reads `.hozo-0` back: it could not
// have seen the escaping however hard it looked.
//
// Neither check here carries an expectation of its own. One is a real CSS
// parser -- lightningcss, the tool that first refused the bad selector --
// and the other is Tailwind's own emission order.
const sheetCandidates = [
  ...catalog,
  // The catalogue is base utilities and none of them starts with a digit,
  // so without these the escaping is never exercised. That is exactly how
  // the bug survived.
  ...['block', 'hidden', 'flex', 'grid'].flatMap((utility) =>
    ['sm', 'md', 'lg', 'xl', '2xl'].map((breakpoint) => `${breakpoint}:${utility}`),
  ),
]
const sheetCache = openCandidateCache()
sheetCache.scanFile('all.tsx', `const all = ${JSON.stringify(sheetCandidates.join(' '))}`, 1)
const sheetHeld = sheetCache.candidates()
const sheetOrder = await loadClassOrder('@import "tailwindcss";', tailwindPackageDir(), sheetHeld)
const sheetOracle = await buildOracle([...sheetHeld])
const sheet = compareCandidateSheet(
  sheetCache.renderCss(undefined, sheetOrder),
  sheetOracle.css,
  sheetHeld,
)

console.log(
  `\n\n== Candidate stylesheet (${sheet.rules} rules) ==\n` +
    'The sheet the third tier ships, as one document rather than one rule\n' +
    'at a time.\n\n' +
    `Parses:      ${sheet.parseError ? `NO -- ${sheet.parseError}` : 'yes'}\n` +
    `In order:    ${sheet.inOrder}/${sheet.comparable}   (against Tailwind's own sequence)`,
)
if (sheet.firstDivergence) console.log(`  first divergence: ${sheet.firstDivergence}`)
record('candidateSheet', {
  rules: sheet.rules,
  parses: sheet.parseError === undefined,
  comparable: sheet.comparable,
  inOrder: sheet.inOrder,
})

// ---------------------------------------------------------------------------
// Refusal audit
// ---------------------------------------------------------------------------
//
// The Native coverage number above is a ratio whose denominator Hozo picks:
// a utility Hozo refuses leaves the numerator and the denominator together,
// so a wrong refusal never moves the percentage and nothing points at it.
// This section takes the refusals apart against React Native's own types --
// the same "ask the other tool to enumerate itself" move the full catalogue
// made for the Web side.

console.log('\n\n== Refusal audit (React Native enumerates its own surface) ==')
console.log(
  `Checked against react-native ${reactNativeVersion()}'s StyleSheet types` +
    `${reactNativeCssProperties() ? ', cross-read with react-native-css' : ''}.\n` +
    'SUSPECT does not mean wrong -- the types are a necessary condition, not a\n' +
    'sufficient one. It means the refusal is a claim the types no longer support.\n',
)

const audits = new Map<string, RefusalAudit[]>()
let nativeRefusals = 0
for (const candidate of catalog) {
  const native = compareNativeCandidate(candidate)
  if (native.verdict !== 'REFUSED') continue
  nativeRefusals += 1
  // Only WEB_ONLY refusals assert anything about React Native.
  // VARIANT_NOT_WIRED already says "Hozo hasn't built this", which is not a
  // claim the types can contradict.
  if (native.code !== 'WEB_ONLY_PROPERTY_ON_NATIVE') continue
  const audit = auditRefusal(candidate, fullOracle.rules.get(candidate), fullVars)
  audits.set(audit.verdict, [...(audits.get(audit.verdict) ?? []), audit])
}

const auditCount = (v: RefusalVerdict) => audits.get(v)?.length ?? 0
const checked = auditCount('CONFIRMED') + auditCount('PARTIAL') + auditCount('SUSPECT')
console.log(
  `Refusals:    ${nativeRefusals} on the catalogue, ${checked} checkable against the types\n` +
    `Confirmed:   ${auditCount('CONFIRMED')}   (React Native has no way to hold this)\n` +
    `Partial:     ${auditCount('PARTIAL')}   (some of what it sets is expressible, some isn't)\n` +
    `Suspect:     ${auditCount('SUSPECT')}   (every property it sets is expressible -- re-read these)\n` +
    `Uncheckable: ${auditCount('UNCHECKABLE')}   (Tailwind's own output resolves to no plain declaration)`,
)
record('refusalAudit', {
  refusals: nativeRefusals,
  checkable: checked,
  confirmed: auditCount('CONFIRMED'),
  partial: auditCount('PARTIAL'),
  suspect: auditCount('SUSPECT'),
  uncheckable: auditCount('UNCHECKABLE'),
})

// Grouped by the CSS the utilities set, because the suspects come in
// families: one wrong refusal is usually hundreds of candidates, and the
// fix is one code path.
const suspectFamilies = new Map<string, string[]>()
for (const audit of audits.get('SUSPECT') ?? []) {
  const key = audit.expressible.join(', ')
  suspectFamilies.set(key, [...(suspectFamilies.get(key) ?? []), audit.candidate])
}
if (suspectFamilies.size > 0) {
  console.log('\nSuspect refusals, grouped by the CSS they set:')
  for (const [properties, list] of [...suspectFamilies].sort((a, b) => b[1].length - a[1].length)) {
    const shown = list.slice(0, 6).join(' ')
    console.log(
      `  ${properties}  (${list.length})\n    ${shown}${list.length > 6 ? ` ... +${list.length - 6}` : ''}`,
    )
  }
}

const partials = audits.get('PARTIAL') ?? []
if (partials.length > 0) {
  console.log('\nPartial -- refusing the whole utility is defensible, but note what is reachable:')
  for (const audit of partials) {
    console.log(
      `  ${audit.candidate}: can hold ${audit.expressible.join(', ')}; cannot hold ${audit.inexpressible.join(', ')}`,
    )
  }
}

// ---------------------------------------------------------------------------
// Native output, checked by React Native
// ---------------------------------------------------------------------------
//
// The refusal audit above checks the denominator. This checks the
// numerator, which nothing did until 2026-08-16: for every style Hozo
// actually emits, `tsc` asks React Native's own declarations whether it
// would be accepted. Same check an app would get, rather than this repo's
// regex reading of the same file.

console.log('\n\n== Native output (React Native type-checks what we emit) ==')

const emitted: { candidate: string; style: string }[] = []
for (const candidate of catalog) {
  const expected = fullOracle.rules.get(candidate)
  if (expected === undefined) continue
  if (compareCandidate(candidate, expected, fullVars).verdict !== 'MATCH') continue
  for (const context of ['View', 'Text']) {
    const source =
      `import { ${context} } from '@hozo/core'\n` +
      `export function C() { return <${context} className="${candidate}">x</${context}> }\n`
    const [result] = compileNative(source)
    if (!result) continue
    for (const match of result.styles.matchAll(/^ {2}(\w+): (\{\n[\s\S]*?^ {2}\}),/gm)) {
      const body = match[2].replace(/^ {2}/gm, '')
      if (body.replace(/\s/g, '') !== '{}') emitted.push({ candidate, style: body })
    }
  }
}

const typeErrors = typeCheckStyles(emitted)
console.log(
  `Entries:     ${emitted.length} style objects, from every candidate that matches on Web\n` +
    `Rejected:    ${typeErrors.length}   (by react-native ${reactNativeVersion()}'s own declarations)`,
)
record('nativeTypes', { entries: emitted.length, rejected: typeErrors.length })
if (typeErrors.length > 0) {
  const byCandidate = new Map<string, string>()
  for (const error of typeErrors) {
    if (!byCandidate.has(error.candidate ?? '?')) {
      byCandidate.set(error.candidate ?? '?', error.message)
    }
  }
  console.log('\nRejected, one line per candidate:')
  for (const [candidate, message] of byCandidate) {
    console.log(`  ${candidate}: ${message}`)
  }
}

// ---------------------------------------------------------------------------
// Web output, rendered
// ---------------------------------------------------------------------------
//
// Everything above compares text. This runs the generated component and
// looks at what comes out -- that the JSX parses, that it mounts, and that
// the class reaching the element is one the stylesheet has a rule for.
// Nothing established any of that until 2026-08-16.

console.log('\n\n== Web output (rendered, not compared as text) ==')

const rendering: { name: string; jsx: string }[] = []
const sheets = new Map<string, { candidate: string; css: string }>()
ALL_CANDIDATES.forEach((candidate, index) => {
  const source =
    `import { View } from '@hozo/core'\n` +
    `export function C() { return <View className="${candidate}">x</View> }\n`
  const [compiled] = hozoCompile(source)
  if (!compiled) return
  const name = `C${index}`
  rendering.push({ name, jsx: compiled.jsx })
  sheets.set(name, { candidate, css: compiled.css })
})

const dangling: string[] = []
for (const output of renderWeb(rendering)) {
  const sheet = sheets.get(output.name)
  if (!sheet) continue
  const defined = classesDefinedIn(sheet.css)
  if ([...output.classes].some((name) => !defined.has(name))) dangling.push(sheet.candidate)
}
console.log(
  `Rendered:    ${rendering.length}/${ALL_CANDIDATES.length} components mounted\n` +
    `Dangling:    ${dangling.length}   (a class reached the DOM with no rule behind it)`,
)
record('render', { rendered: rendering.length, dangling: dangling.length })
if (dangling.length > 0) {
  console.log(`  ${dangling.join(' ')}`)
}

// == Runtime cost =========================================================
//
// The first measurement in this package that is about the runtime rather
// than the compiler. Everything above asks what Hozo emits; this asks what
// keeping it on screen costs, which nothing did -- the only runtime number
// this project had was a bundle size.
//
// Counts rather than milliseconds, because the claims the runtime makes
// are counts: a component using only `md:` must not re-render when the
// window moves inside a breakpoint. That is why the viewport and the
// breakpoint are two stores, it is written down in `hooks.native.ts`, and
// nothing checked it until now. See `runtime-cost.ts`.
const runtime = measureRuntimeCost()
console.log(
  `\n\n== Runtime cost (${runtime.components} components on screen) ==\n` +
    'Re-renders, counted per component. Fewer is better everywhere except\n' +
    'the mount, which is one apiece by definition.\n\n' +
    `Mount:                     ${runtime.mount}\n` +
    `Colour scheme changed:     ${runtime.colorSchemeChange}   (the ones using dark:)\n` +
    `Resized inside a breakpoint: ${runtime.resizeWithinBreakpoint}   (has to be zero)\n` +
    `Crossed a breakpoint:      ${runtime.breakpointCross}   (the ones using md:)`,
)
record('runtime', {
  components: runtime.components,
  mount: runtime.mount,
  colorSchemeChange: runtime.colorSchemeChange,
  resizeWithinBreakpoint: runtime.resizeWithinBreakpoint,
  breakpointCross: runtime.breakpointCross,
})

// == Arbitrary syntax =====================================================
//
// A separate denominator because it has to be built differently: the named
// catalogue is enumerable and this one isn't, so the candidates are derived
// by crossing every prefix Tailwind uses with a set of representative
// values and keeping whatever Tailwind generates a rule for. See
// `arbitrary-catalog.ts`.
//
// Reported apart from the main figure rather than folded into it, because
// the two denominators mean different things: one is "every utility that
// exists", the other is "a cross-section of a syntax with no bounds". Adding
// them would produce a number that answers neither question.
const arbitrary = await buildArbitraryCatalog()
const arbitraryResults = arbitrary.candidates.map((candidate) =>
  // Theme values as well as the `@property` defaults, the way every other
  // section resolves. This section had only the defaults, so
  // `var(--default-transition-duration)` never resolved here -- invisible
  // while an unresolved value ended the comparison, and 24 mismatches the
  // moment one stopped doing that.
  compareCandidate(
    candidate,
    arbitrary.oracle.rules.get(candidate),
    new Map([...loadThemeVars(), ...arbitrary.oracle.registerDefaults]),
  ),
)
const arbitraryCount = (verdict: Verdict) =>
  arbitraryResults.filter((result) => result.verdict === verdict).length
const arbitraryMismatches = arbitraryResults.filter((r) => r.verdict === 'MISMATCH')
const arbitrarySkips = (reason: SkipReason) =>
  arbitraryResults.filter((result) => result.skipReason === reason).length
// A value only a browser can reduce is still compared -- as text, as far
// as the substitutions go -- so it no longer leaves the denominator. This
// counts how many of the matches rest on that, because it is a weaker
// claim than the rest of the section makes and the number saying so should
// be visible rather than implied.
const arbitraryTextual = arbitraryResults.filter((result) => result.textual).length
console.log(
  `\n== Arbitrary values (${arbitrary.candidates.length} candidates Tailwind generates) ==\n` +
    `Match:       ${arbitraryCount('MATCH')}   (${arbitraryTextual} of them compared as text, ` +
    `not as computed values)\n` +
    `Mismatch:    ${arbitraryMismatches.length}\n` +
    `Unsupported: ${arbitraryCount('UNSUPPORTED')}\n` +
    `Skipped:     ${arbitraryCount('SKIPPED')}   ` +
    `(tailwind emits no rule: ${arbitrarySkips('no-rule')})`,
)
record('arbitrary', {
  candidates: arbitrary.candidates.length,
  match: arbitraryCount('MATCH'),
  textual: arbitraryTextual,
  mismatch: arbitraryMismatches.length,
  unsupported: arbitraryCount('UNSUPPORTED'),
  skipped: arbitraryCount('SKIPPED'),
})
for (const mismatch of arbitraryMismatches) {
  console.log(`  ${mismatch.candidate.padEnd(34)} ${mismatch.detail ?? ''}`)
}

// The same candidates asked of the Native backend, and only for silence.
//
// Fidelity is not the question here -- an arbitrary value is a CSS
// property written out by name, and React Native's style keys are a
// different vocabulary, so nearly all of these are refusals and the
// interesting number is how many are refused *without saying so*.
//
// This section existed and looked only at Web, which is how
// `animate-[wiggle_1s_infinite]` came to compile on Native to an empty
// style object with no diagnostic at all -- the exact "silent" category
// the sections above keep at zero, in the one place nothing was counting
// it. The Native emitter even carried a comment saying the case was
// refused upstream; nothing refused it.
// A utility that paints nothing standalone paints nothing here either,
// and that is the right answer rather than a silence. Which ones those
// are is already decided a few lines above, by Tailwind: the Web
// comparison calls them COMPOSITION_ONLY because the reference engine's
// own output for them sets only `--tw-*` registers. Reusing that verdict
// keeps the two sections agreeing about what a composition is, instead of
// a second list to maintain and disagree with.
const compositionOnly = new Set(
  arbitraryResults.filter((r) => r.verdict === 'COMPOSITION_ONLY').map((r) => r.candidate),
)
const arbitraryNative = arbitrary.candidates.map(compareNativeCandidate).map((result) =>
  result.verdict === 'SILENT' && compositionOnly.has(result.candidate)
    ? {
        ...result,
        verdict: 'NO_OP' as const,
        detail: 'paints nothing standalone on either platform',
      }
    : result,
)
const arbitraryNativeCount = (verdict: NativeVerdict) =>
  arbitraryNative.filter((result) => result.verdict === verdict).length
console.log(
  `\n\n== Arbitrary values on Native (${arbitrary.candidates.length}) ==\n` +
    'Almost all of these are refusals, which is the right answer. The number that\n' +
    'matters is the last one.\n\n' +
    `Covered:  ${arbitraryNativeCount('COVERED')}\n` +
    `Refused:  ${arbitraryNativeCount('REFUSED')}\n` +
    `No-op:    ${arbitraryNativeCount('NO_OP')}\n` +
    `Silent:   ${arbitraryNativeCount('SILENT')}   (no style, no diagnostic)`,
)
record('arbitraryNative', {
  candidates: arbitrary.candidates.length,
  covered: arbitraryNativeCount('COVERED'),
  refused: arbitraryNativeCount('REFUSED'),
  noOp: arbitraryNativeCount('NO_OP'),
  silent: arbitraryNativeCount('SILENT'),
})
for (const result of arbitraryNative) {
  if (result.verdict !== 'SILENT') continue
  console.log(`  SILENT  ${result.candidate}`)
}

// == Canvas paint =========================================================
//
// A shape has a fill, a stroke, a stroke width and an opacity, so almost
// every utility is a refusal here and the number that matters is how many
// are refused without saying so. See `canvas.ts`; the section exists
// because Canvas had no denominator at all.
const canvasCatalogue = await loadFullCatalog()
for (const [platform, native] of [
  ['web', false],
  ['native', true],
] as const) {
  for (const [name, list] of [
    ['canvas', canvasCatalogue],
    ['canvasArbitrary', arbitrary.candidates],
  ] as const) {
    const results = list.map((candidate) => compareCanvasCandidate(candidate, native))
    const count = (verdict: CanvasVerdict) =>
      results.filter((result) => result.verdict === verdict).length
    console.log(
      `\n\n== Canvas paint, ${platform} (${list.length} ` +
        `${name === 'canvas' ? 'utilities' : 'arbitrary values'}) ==\n` +
        `Covered:      ${count('COVERED')}\n` +
        `Refused:      ${count('REFUSED')}\n` +
        `Silent:       ${count('SILENT')}   (no paint, no diagnostic)\n` +
        `Unresolvable: ${count('UNRESOLVABLE')}   ` +
        `(painted with a value no canvas resolves)`,
    )
    record(`${name}${platform === 'native' ? 'Native' : ''}`, {
      candidates: list.length,
      covered: count('COVERED'),
      refused: count('REFUSED'),
      silent: count('SILENT'),
      unresolvable: count('UNRESOLVABLE'),
    })
    for (const result of results) {
      if (result.verdict !== 'UNRESOLVABLE' && result.verdict !== 'SILENT') continue
      const paint = result.replacement ?? ''
      console.log(`  ${result.verdict.padEnd(13)} ${result.candidate.padEnd(28)} ${paint}`)
    }
  }
}

// == Compositions =========================================================
//
// The third denominator, and the one that measures what the other two
// can't. Every section above compares one utility at a time, which is
// exactly wrong for the families Tailwind builds out of several: the
// gradient constructors and their stops, the ring and shadow layers, the
// filter chain, the transform axes. All of those come back
// COMPOSITION_ONLY one at a time -- a true verdict that leaves 971
// gradient entries alone unmeasured.
//
// Hand-written rather than derived, unlike the other two, because there
// is nothing to derive it from: Tailwind enumerates its utilities and
// not the interactions between them. See `compositions.ts`.
const compositions = await buildCompositionCatalog()
const compositionVars = new Map([...loadThemeVars(), ...compositions.registerDefaults])
const compositionResults = compositions.candidates.map((candidate) =>
  compareCandidate(candidate, compositions.expected.get(candidate), compositionVars),
)
const compositionCount = (verdict: Verdict) =>
  compositionResults.filter((result) => result.verdict === verdict).length
console.log(
  `\n\n== Compositions (${compositions.candidates.length} combinations) ==\n` +
    'Several utilities reaching one declaration, which a one-utility comparison\n' +
    'reports as composition-only and never checks.\n\n' +
    `Match:       ${compositionCount('MATCH')}\n` +
    `Mismatch:    ${compositionCount('MISMATCH')}\n` +
    `Unsupported: ${compositionCount('UNSUPPORTED')}\n` +
    `Skipped:     ${compositionCount('SKIPPED')}   (one side unresolvable; no claim made)\n` +
    `Inert:       ${compositionCount('COMPOSITION_ONLY')}   (still paints nothing even combined)`,
)
record('compositions', {
  candidates: compositions.candidates.length,
  match: compositionCount('MATCH'),
  mismatch: compositionCount('MISMATCH'),
  unsupported: compositionCount('UNSUPPORTED'),
  skipped: compositionCount('SKIPPED'),
  inert: compositionCount('COMPOSITION_ONLY'),
})
for (const result of compositionResults) {
  if (result.verdict === 'MATCH') continue
  console.log(`  ${result.verdict.padEnd(17)} ${result.candidate}\n    ${result.detail ?? ''}`)
}

// == Composed (Tailwind's own registers say which utilities meet) ==========
//
// The section above is fifty combinations somebody chose. This one is the
// same question asked of everything, with the pairing read out of the
// stylesheet rather than decided: a utility that writes `--tw-ring-color`
// and one that reads it belong together, and Tailwind says which is which.
//
// It closes the largest measurement gap left in this report. Of 23286
// catalogue entries, 3006 paint nothing on their own and leave the
// denominator for it -- `ring-*` at 6 of 594, `shadow-*` at 10 of 302,
// `from-*`/`via-*`/`to-*` at zero of 937. Every one of those verdicts was
// true and none of them was a measurement.
//
// See `composed.ts` for why the two axes are counted separately rather
// than crossed, and for the `transition` trap that made a naive version
// pair every gradient stop with the wrong utility.
const composed = await buildComposedCatalog()
const composedVars = new Map([...loadThemeVars(), ...composed.registerDefaults])
const composedResults = composed.candidates.map((candidate) =>
  compareCandidate(candidate, composed.expected.get(candidate), composedVars),
)
const composedCount = (verdict: Verdict) =>
  composedResults.filter((result) => result.verdict === verdict).length
console.log(
  `\n\n== Composed (${composed.candidates.length} derived from ${composed.counts.producers} ` +
    `producers and ${composed.counts.consumers} consumers) ==\n` +
    'Which utilities meet is read from the registers Tailwind writes and reads,\n' +
    'not from a list. Every producer once against the consumer that reaches it,\n' +
    'plus every producer shape against every consumer shape that reads it.\n\n' +
    `Match:       ${composedCount('MATCH')}\n` +
    `Mismatch:    ${composedCount('MISMATCH')}\n` +
    `Unsupported: ${composedCount('UNSUPPORTED')}\n` +
    `Skipped:     ${composedCount('SKIPPED')}   (one side unresolvable; no claim made)\n` +
    `Inert:       ${composedCount('COMPOSITION_ONLY')}   (still paints nothing even combined)\n` +
    `Unreachable: ${composed.unreachable.length}   (a producer nothing reads -- a hole in this section)`,
)
record('composed', {
  candidates: composed.candidates.length,
  value: composed.counts.value,
  structure: composed.counts.structure,
  match: composedCount('MATCH'),
  mismatch: composedCount('MISMATCH'),
  unsupported: composedCount('UNSUPPORTED'),
  skipped: composedCount('SKIPPED'),
  inert: composedCount('COMPOSITION_ONLY'),
  unreachable: composed.unreachable.length,
})
// Named rather than only counted: a producer with no consumer is a hole in
// this section's own search, and the number alone would say a hole exists
// without saying where. Four appeared the first time this ran -- every
// `-reverse` utility at once -- because the rule that keeps a *clearing*
// consumer out of a pair was written wide enough to exclude a consumer
// that declares the register's default and then reads it.
for (const candidate of composed.unreachable) {
  console.log(`  UNREACHABLE       ${candidate}\n    nothing in the catalogue reads what it writes`)
}
for (const result of composedResults) {
  if (result.verdict === 'MATCH') continue
  console.log(`  ${result.verdict.padEnd(17)} ${result.candidate}\n    ${result.detail ?? ''}`)
}

// == Variants =============================================================
//
// The fourth denominator, and the only one that checks *where* a rule
// applies. Everything above matches declaration text, so a rule that lost
// its `@media` wrapper reads as identical to one that kept it -- and
// Tailwind's `getClassList()` enumerates utilities without the variants in
// front of them, so no derived list contains `md:hover:flex` either.
// Between the two, stacked variants compiled to nothing at all and nothing
// here could have said so. See `variants.ts`.
const variants = await buildVariantCatalog()
const variantResults = variants.cases.map((entry) => compareVariant(entry, variants.vars))
const variantCount = (verdict: string) =>
  variantResults.filter((result) => result.verdict === verdict).length
console.log(
  `\n\n== Variants (${variants.cases.length} single and stacked) ==\n` +
    'Declarations, the selector matched, and the at-rules around it.\n\n' +
    `Match:       ${variantCount('MATCH')}\n` +
    `Mismatch:    ${variantCount('MISMATCH')}\n` +
    `Unsupported: ${variantCount('UNSUPPORTED')}   (Hozo emits no rule)`,
)
record('variants', {
  total: variants.cases.length,
  match: variantCount('MATCH'),
  mismatch: variantCount('MISMATCH'),
  unsupported: variantCount('UNSUPPORTED'),
})
for (const result of variantResults) {
  if (result.verdict === 'MATCH') continue
  console.log(`  ${result.verdict.padEnd(12)} ${result.candidate}\n    ${result.detail ?? ''}`)
}

const nativeVariantResults = variants.cases.map((entry) => compareNativeCandidate(entry.candidate))
const nativeVariantCount = (verdict: NativeVerdict) =>
  nativeVariantResults.filter((result) => result.verdict === verdict).length
const nativeVariantRestricted = nativeVariantResults.filter(
  (result) => result.verdict === 'COVERED' && result.restrictedTo,
)
console.log(
  `\n\n== Native variants (${variants.cases.length} single and stacked) ==\n` +
    'Coverage across the same target-aware Native probe contexts.\n\n' +
    `Covered:    ${nativeVariantCount('COVERED')}\n` +
    `Restricted: ${nativeVariantRestricted.length}   (included in covered)\n` +
    `Refused:    ${nativeVariantCount('REFUSED')}\n` +
    `Silent:     ${nativeVariantCount('SILENT')}\n` +
    `No-op:      ${nativeVariantCount('NO_OP')}`,
)
record('nativeVariants', {
  total: variants.cases.length,
  covered: nativeVariantCount('COVERED'),
  restricted: nativeVariantRestricted.length,
  refused: nativeVariantCount('REFUSED'),
  silent: nativeVariantCount('SILENT'),
  noOp: nativeVariantCount('NO_OP'),
})
for (const result of nativeVariantResults) {
  if (result.verdict === 'COVERED') continue
  console.log(`  ${result.verdict.padEnd(12)} ${result.candidate}\n    ${result.detail ?? ''}`)
}

// Last, so a report that throws part-way writes nothing rather than a
// half-built snapshot that would read as a pile of regressions.
finish(process.argv.includes('--check'))
