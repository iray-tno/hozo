// Turns the report into a check.
//
// `run.ts` prints fifteen-odd numbers that are this project's headline
// claims -- 0 mismatches against Tailwind's own 20222-entry catalogue, 0
// classes that compile to nothing without saying so, 0 rules that reach
// the DOM with nothing behind them. Until this file existed it printed
// them and exited 0, which meant every "0 mismatches" in a commit message
// was there because a human remembered to run a nine-minute script and
// read the output. Nothing stopped a change from moving any of them.
//
// A snapshot rather than a set of thresholds, and the difference matters.
// A threshold catches `mismatch: 0 -> 3`. It does not catch
// `unsupported: 0 -> 3`, or `match: 20222 -> 20219`, or a variant family
// quietly falling out of the denominator -- and those are the shapes a
// regression here actually takes, because a compiler that stops
// recognising something reports *less*, not wrong.
//
// So every number is recorded, and any change fails. Including an
// improvement: 14490 combinations passing where 13668 did is a fact worth
// a line in the diff of the commit that earned it. The failure message
// says which direction each number moved and whether that direction is
// the good one, so updating the file is a decision rather than a reflex.
//
// The Tailwind and React Native versions are recorded too. When a bump
// legitimately moves the numbers, the diff shows the bump beside them
// instead of leaving someone to guess.

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'snapshot.json')

/**
 * Names whose rise is a regression.
 *
 * Read as "more of this is worse". A count of things Hozo could not do,
 * did wrong, or declined to claim.
 */
const WORSE_WHEN_UP = new Set([
  'mismatch',
  'unsupported',
  'silent',
  'dangling',
  'skipped',
  'suspect',
  'rejected',
  // A producer nothing reads is a hole in the composed section, not a
  // fact about Tailwind: every one of the 3006 was reachable when it was
  // written, so one appearing means the search for its consumer broke.
  'unreachable',
  // Re-renders. Every one of these is work a device does to show the same
  // screen, so more of it is worse without qualification -- including
  // `mount`, which is one per component and has nowhere to go but up.
  // `resizeWithinBreakpoint` is the one that should be zero: a component
  // using only `md:` has no reason to render again because the window
  // moved 30 pixels, and the two separate stores in `hooks.native.ts` are
  // there so it does not.
  'mount',
  'colorSchemeChange',
  'resizeWithinBreakpoint',
  'breakpointCross',
  // A paint prop came out, so the compiler thinks it handled the class --
  // but the value is a `var()` or a `calc()`, and neither Canvas 2D's
  // `fillStyle` nor Skia resolves those. Worse than a refusal, because a
  // refusal is visible: this one draws nothing and says nothing.
  'unresolvable',
  // A diagnostic that fires on correct code. Worse than a missing check:
  // the first thing anyone does with a noisy one is turn it off, and the
  // real findings leave with it.
  'falsePositives',
  // A declared diagnostic that no source makes fire, and one with no case
  // to try. Both mean the same thing from outside: a check whose absence
  // would look exactly like clean code.
  'noCase',
  // A primitive the compiler knows and no contract describes. The two
  // backends can then disagree about it with nothing saying so.
  'uncontracted',
])

/**
 * Names whose fall is a regression: how much is covered, and correctly.
 *
 * `candidates` is here because a denominator that shrinks is the failure
 * this whole file exists to catch. It happened: nine variants left the
 * variant catalogue at once and every number printed about the smaller
 * set was correct. A denominator is allowed to be small and not allowed
 * to shrink quietly, so a fall gets the word REGRESSION next to it even
 * when Tailwind is the one that dropped a utility.
 */
const WORSE_WHEN_DOWN = new Set([
  'match',
  'coverage',
  'fidelity',
  'covered',
  'total',
  'comparable',
  'candidates',
  // The runtime section's denominator, for the same reason `candidates` is
  // here: a scene that quietly got smaller makes every count below it look
  // better.
  'components',
  // And the contract sections'. These are lists somebody chose rather than
  // denominators derived from anything, which makes shrinking one the
  // easiest way to make them pass.
  'cases',
  // The ARIA denominator is derived, so a fall here means the
  // specification's own role list shrank -- or the filter reading it did.
  'roles',
  'staticRoles',
  'interactiveRoles',
  // Every diagnostic the compiler declares. A fall means one was deleted,
  // which is a decision that belongs in a diff.
  'declared',
  'fires',
])

type Section = Record<string, number | string>

const sections: Record<string, Section> = {}

/**
 * Records one section's numbers, under the heading the report prints.
 *
 * Called beside the `console.log` that prints them, from the same
 * variables, so the file and the output cannot drift into disagreeing.
 * A second derivation would be a second thing to get wrong.
 */
/**
 * Wall time per section, in seconds.
 *
 * Falls out of `record` rather than being wired in at each site: the
 * report is sequential and every section ends by recording its numbers,
 * so the gap between two calls is the section between them. The first
 * one absorbs the catalogue building that precedes it, which is where
 * that cost belongs anyway.
 *
 * Here because its absence produced a wrong answer. The addon was
 * measured on one section, found to be eight times faster in release, and
 * that ratio was extrapolated to the whole report -- which turned out to
 * be 45.5 minutes against 37.8, a fifth of what the extrapolation
 * claimed. The report could not say where its time went, so the guess had
 * nothing to correct it.
 *
 * Not recorded in the snapshot. These are properties of a machine, not of
 * the compiler, and `--check` would fail on every run.
 */
const elapsed: Record<string, number> = {}
let lastMark = performance.now()

export function record(section: string, values: Section): void {
  const now = performance.now()
  elapsed[section] = (elapsed[section] ?? 0) + (now - lastMark) / 1000
  lastMark = now
  sections[section] = { ...(sections[section] ?? {}), ...values }
}

function reportTimings(): void {
  const rows = Object.entries(elapsed).sort(([, a], [, b]) => b - a)
  const total = rows.reduce((sum, [, seconds]) => sum + seconds, 0)
  if (total === 0) return
  console.log(`\n\n== Where the time went (${total.toFixed(0)}s) ==`)
  for (const [section, seconds] of rows) {
    const share = Math.round((seconds / total) * 100)
    console.log(`  ${section.padEnd(22)} ${seconds.toFixed(1).padStart(7)}s  ${String(share).padStart(3)}%`)
  }
}

export interface Change {
  path: string
  before: number | string
  after: number | string
}

/**
 * Writes the snapshot, or compares against it and exits 1 on any change.
 *
 * `--check` is the CI mode. Without it this rewrites the file, which is
 * what you run after a change you meant to make.
 */
export function finish(check: boolean): void {
  reportTimings()
  const current = JSON.stringify(sections, null, 2) + '\n'
  if (!check) {
    // The failure this whole file exists to prevent, in its own image: if
    // `--check` were ever dropped on the way to this script -- a task
    // runner not forwarding it, a workflow edited in a hurry -- CI would
    // rewrite the snapshot, discard it with the runner, and go green
    // having checked nothing. Writing is a local act; in CI it is a
    // misconfiguration, so it says so instead.
    if (process.env.CI) {
      console.error(
        '\n\nRunning in CI without `--check`, which would write the snapshot and\n' +
          'report success without comparing anything. Refusing.',
      )
      process.exit(1)
    }
    writeFileSync(FILE, current)
    console.log(`\n\nwrote ${path.relative(process.cwd(), FILE)}`)
    return
  }

  let recorded: Record<string, Section>
  try {
    recorded = JSON.parse(readFileSync(FILE, 'utf8'))
  } catch {
    console.error(`\n\nNo snapshot at ${FILE}. Run the report without --check to write one.`)
    process.exit(1)
  }

  const changes = diff(recorded, sections)
  if (changes.length === 0) {
    console.log('\n\nSnapshot matches. Nothing moved.')
    return
  }

  console.error(`\n\n${changes.length} number(s) moved since the snapshot:\n`)
  for (const change of changes) {
    console.error(`  ${change.path.padEnd(38)} ${change.before} -> ${change.after}  ${verdict(change)}`)
  }
  console.error(
    '\nIf these are the numbers you meant to produce, rerun the report without\n' +
      '`--check` and commit the file. That is the point: the claim moves in a\n' +
      'diff someone signed off on, rather than quietly.',
  )
  process.exit(1)
}

/**
 * Every key present in either side whose value differs.
 *
 * Exported so the checker itself is testable. `finish` is the shell that
 * reads a file and exits a process, which is not.
 */
export function diff(before: Record<string, Section>, after: Record<string, Section>): Change[] {
  const changes: Change[] = []
  for (const section of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const left = before[section] ?? {}
    const right = after[section] ?? {}
    for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
      if (left[key] === right[key]) continue
      changes.push({
        path: `${section}.${key}`,
        before: left[key] ?? '(absent)',
        after: right[key] ?? '(absent)',
      })
    }
  }
  return changes
}

/**
 * What a move means, where the direction has a meaning.
 *
 * Silent about the rest -- `refused` going up is how a refusal with a
 * reason gets added, and calling that a regression would train people to
 * ignore this column.
 */
export function verdict({ path: key, before, after }: Change): string {
  const name = key.split('.').pop() ?? ''
  if (typeof before !== 'number' || typeof after !== 'number') return ''
  const up = after > before
  if (WORSE_WHEN_UP.has(name)) return up ? '<-- REGRESSION' : 'improvement'
  if (WORSE_WHEN_DOWN.has(name)) return up ? 'improvement' : '<-- REGRESSION'
  return ''
}
