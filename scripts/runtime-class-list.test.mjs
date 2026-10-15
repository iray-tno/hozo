import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  AFTER,
  BEFORE,
  options,
  renderDriver,
  summarize,
  summarizeOperations,
} from './runtime-class-list.mjs'
import { report } from './runtime-class-list-report.mjs'

test('renderer timing capability changes only at load and the public performance API is restored', () => {
  const measure = globalThis.performance.measure
  const descriptor = Object.getOwnPropertyDescriptor(globalThis.performance, 'measure')
  const renderer = {}
  assert.equal(
    renderDriver(() => {
      assert.equal(globalThis.performance.measure, undefined)
      return renderer
    }),
    renderer,
  )
  assert.equal(globalThis.performance.measure, measure)
  assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis.performance, 'measure'), descriptor)
  assert.throws(
    () =>
      renderDriver(() => {
        throw new Error('load failed')
      }),
    /load failed/,
  )
  assert.equal(globalThis.performance.measure, measure)
  assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis.performance, 'measure'), descriptor)
})

test('the runtime-list measurement keeps samples and validates bounded, reproducible options', () => {
  const raw = [9, 1, 4, 2, 7]
  assert.deepEqual(summarize(raw), { medianMs: 4, p90Ms: 9, minMs: 1, maxMs: 9, samplesMs: raw })
  assert.deepEqual(raw, [9, 1, 4, 2, 7], 'summary must not sort the evidence in place')
  assert.deepEqual(options(['--rows', '8,32', '--samples', '2', '--warmups', '0']).rows, [8, 32])
  for (const args of [
    ['--rows', '0'],
    ['--rows', 'NaN'],
    ['--samples', '0'],
    ['--warmups', '-1'],
    ['--typo', '1'],
    ['--rows'],
  ])
    assert.throws(() => options(args))
  assert.throws(() => summarize([]))
  assert.throws(() => summarize([Number.NaN]))
})

test('the historical series is pinned and stays outside the ordinary PR test gate', () => {
  const workflow = readFileSync(
    new URL('../.github/workflows/runtime-class-list.yml', import.meta.url),
    'utf8',
  )
  assert.ok(workflow.includes(BEFORE))
  assert.ok(workflow.includes(AFTER))
  assert.match(workflow, /workflow_dispatch:/)
  assert.match(workflow, /pull_request:/)
  assert.match(workflow, /paths:/)
  assert.match(workflow, /if: always\(\)/)
  assert.match(workflow, /actions\/upload-artifact@v4/)
  assert.doesNotMatch(
    readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8'),
    /runtime-class-list\.mjs/,
  )
})

function syntheticSeries() {
  const currentCommit = 'a'.repeat(40)
  const records = Object.fromEntries(
    ['before', 'after', 'current'].map((name) => [
      name,
      {
        schemaVersion: 1,
        sourceCommit: name === 'before' ? BEFORE : name === 'after' ? AFTER : currentCommit,
        driverCommit: currentCommit,
        binarySha256: (name === 'before' ? 'b' : name === 'after' ? 'c' : 'd').repeat(64),
        environment: { node: 'test', react: 'test' },
        methodology: { rows: [4], samples: 3, warmups: 1 },
        fixture: { source: 'same synthetic fixture' },
        warnings: { runtime: name === 'before' ? ['active:opacity-50 is unsupported'] : [] },
        results: ['plain', 'state-classes'].map((scenario) => ({
          scenario,
          rows: 4,
          semantic: {
            restingOpacity: null,
            siblingOpacity: null,
            stateSupported: name !== 'before' && scenario === 'state-classes',
            pressedOpacity: name !== 'before' && scenario === 'state-classes' ? 0.5 : null,
          },
          mount: summarize([1, 3, 2]),
          parentUpdate: summarize([2, 1, 3]),
          oneRowPress: summarize([3, 2, 1]),
        })),
      },
    ]),
  )
  return { records, currentCommit }
}

test('comparison labels unequal historical state support and rejects incomplete or mismatched evidence', () => {
  const { records, currentCommit } = syntheticSeries()
  const markdown = report(records, currentCommit)
  assert.match(markdown, /not equal-feature speed comparisons/)
  assert.match(markdown, /oneRowPress/)
  for (const mutate of [
    (copy) => {
      copy.before.sourceCommit = currentCommit
    },
    (copy) => {
      copy.after.binarySha256 = copy.before.binarySha256
    },
    (copy) => {
      copy.after.driverCommit = BEFORE
    },
    (copy) => {
      copy.after.environment.react = 'other'
    },
    (copy) => {
      copy.before.results.pop()
    },
    (copy) => {
      copy.current.results[1].semantic.stateSupported = false
    },
    (copy) => {
      copy.current.results[1].semantic.siblingOpacity = 0.5
    },
    (copy) => {
      copy.current.results[0].mount.samplesMs.pop()
    },
    (copy) => {
      copy.current.results[0].mount.medianMs = 99
    },
    (copy) => {
      copy.before.warnings.runtime = []
    },
  ]) {
    const copy = structuredClone(records)
    mutate(copy)
    assert.throws(() => report(copy, currentCommit))
  }
})

test('a production series reports and validates mount phases next to its totals', () => {
  const timings = {
    mount: [
      { totalMs: 3, commitMs: 2, passiveMs: 1 },
      { totalMs: 5, commitMs: 4, passiveMs: 1 },
      { totalMs: 4, commitMs: 4, passiveMs: 0 },
    ],
    parentUpdate: [1, 2, 3].map((totalMs) => ({ totalMs, commitMs: totalMs, passiveMs: 0 })),
    oneRowPress: [1, 2, 3].map((totalMs) => ({ totalMs, commitMs: totalMs, passiveMs: 0 })),
  }
  const summarized = summarizeOperations(timings)
  assert.deepEqual(summarized.mount.samplesMs, [3, 5, 4])
  assert.deepEqual(summarized.phases.mount.passiveMs.samplesMs, [1, 1, 0])
  // Development, inside `act`, has nothing to split.
  assert.equal(summarizeOperations({ mount: [{ totalMs: 1 }] }).phases, undefined)
  assert.equal(options(['--react', 'production']).react, 'production')
  assert.throws(() => options(['--react', 'profiling']))

  const { records, currentCommit } = syntheticSeries()
  for (const record of Object.values(records)) {
    record.methodology.react = 'production'
    for (const result of record.results) Object.assign(result, summarizeOperations(timings))
  }
  assert.match(report(records, currentCommit), /Mount by phase/)
  const missing = structuredClone(records)
  delete missing.current.results[0].phases
  assert.throws(() => report(missing, currentCommit))
  const edited = structuredClone(records)
  edited.after.results[0].phases.mount.passiveMs.medianMs = 9
  assert.throws(() => report(edited, currentCommit))
})

test('an optimization baseline is measured on the same runner and must match its explicit commit', () => {
  const { records, currentCommit } = syntheticSeries()
  const baselineCommit = 'e'.repeat(40)
  records.baseline = { ...structuredClone(records.current), sourceCommit: baselineCommit }
  const markdown = report(records, currentCommit, baselineCommit)
  assert.match(markdown, /Current \/ baseline/)
  assert.ok(markdown.includes(baselineCommit))
  assert.throws(() => report(records, currentCommit))
  assert.throws(() => report(records, currentCommit, BEFORE))
  records.baseline.environment.react = 'different'
  assert.throws(() => report(records, currentCommit, baselineCommit))
})
