// The checker, checked.
//
// `run.ts` takes nine minutes, so the thing that decides whether a run
// passes cannot be verified by running it -- and a checker that silently
// passes everything is worse than no checker, because it looks like
// coverage. These tests are the fast half: `diff` and `verdict` are pure,
// and `finish` is the shell around them that reads a file and exits a
// process.

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { test } from 'node:test'

import { diff, verdict } from './snapshot.ts'

test('an unchanged snapshot produces no changes', () => {
  const snapshot = { variants: { total: 14490, mismatch: 0 } }
  assert.deepEqual(diff(snapshot, structuredClone(snapshot)), [])
})

test('a number moving in either direction is a change', () => {
  // Both directions, because an improvement has to be committed too --
  // the file is the claim, and a claim that drifts without a diff is the
  // thing this exists to prevent.
  const worse = diff({ v: { mismatch: 0 } }, { v: { mismatch: 3 } })
  const better = diff({ v: { mismatch: 3 } }, { v: { mismatch: 0 } })
  assert.equal(worse.length, 1)
  assert.equal(better.length, 1)
})

test('a key appearing or disappearing is a change', () => {
  // The shape this actually takes: a section renamed, or a count that
  // stopped being computed. Comparing only the keys both sides have would
  // let a whole measurement vanish silently.
  assert.deepEqual(diff({ v: { a: 1 } }, { v: {} }), [
    { path: 'v.a', before: 1, after: '(absent)' },
  ])
  assert.deepEqual(diff({}, { v: { a: 1 } }), [{ path: 'v.a', before: '(absent)', after: 1 }])
})

test('the direction of a move is named where it means something', () => {
  // More mismatches is a regression; more matches is not.
  assert.match(verdict({ path: 'catalogue.mismatch', before: 0, after: 3 }), /REGRESSION/)
  assert.equal(verdict({ path: 'catalogue.mismatch', before: 3, after: 0 }), 'improvement')
  assert.match(verdict({ path: 'catalogue.match', before: 20222, after: 20219 }), /REGRESSION/)
  assert.equal(verdict({ path: 'catalogue.match', before: 20219, after: 20222 }), 'improvement')
})

test('a count whose direction has no meaning is left unlabelled', () => {
  // `refused` goes up when a refusal with a reason is added, which is how
  // this project says "React Native cannot do that". Calling it a
  // regression would train people to skim the column.
  assert.equal(verdict({ path: 'native.refused', before: 7, after: 9 }), '')
  assert.equal(verdict({ path: 'versions.tailwind', before: '4.3.3', after: '4.4.0' }), '')
})

test('the counts that have to stay at zero are the ones named as regressions', () => {
  // Named individually rather than by asserting the set, because the
  // point is which words appear in `run.ts`'s output -- a typo in either
  // list means a real regression prints without a label.
  for (const name of ['mismatch', 'unsupported', 'silent', 'dangling', 'skipped', 'suspect', 'rejected']) {
    assert.match(
      verdict({ path: `section.${name}`, before: 0, after: 1 }),
      /REGRESSION/,
      name,
    )
  }
})

// The two paths that end in `process.exit`, which a test cannot call in
// its own process. Run in a subprocess against the real `snapshot.json`,
// because what is under test is the exit code -- and an exit code is the
// only part of this a CI runner reads.

const RUN = `
  const { record, finish } = await import('./src/snapshot.ts')
  const real = JSON.parse((await import('node:fs')).readFileSync('./snapshot.json', 'utf8'))
  for (const [section, values] of Object.entries(real)) record(section, values)
  MUTATE
  finish(CHECK)
`

function run(mutate: string, check: boolean, env: NodeJS.ProcessEnv = {}): number {
  const source = RUN.replace('MUTATE', mutate).replace('CHECK', String(check))
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', source], {
    cwd: path.join(import.meta.dirname, '..'),
    env: { ...process.env, CI: '', ...env },
    encoding: 'utf8',
  })
  return result.status ?? -1
}

test('an unchanged run exits zero', () => {
  assert.equal(run('', true), 0)
})

test('a moved number exits non-zero', () => {
  // The whole point. Verified against the committed snapshot rather than
  // a fixture, so a change to the file's shape breaks this too.
  assert.equal(run(`record('catalogue', { mismatch: 3 })`, true), 1)
  // An improvement fails as well -- it is still a claim that moved.
  assert.equal(run(`record('variants', { total: 99999 })`, true), 1)
})

test('CI without --check refuses rather than writing', () => {
  // The failure this file exists to prevent, wearing its own clothes: a
  // task runner that drops the flag would have CI rewrite the snapshot,
  // throw it away with the runner, and report success.
  assert.equal(run('', false, { CI: 'true' }), 1)
})
