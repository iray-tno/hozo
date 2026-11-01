import assert from 'node:assert/strict'
import test from 'node:test'
import { stylingFactStatus } from './style-slots/status.mjs'

const commit = 'a'.repeat(40)
const states = [
  [false, 'rest'],
  [true, 'rest'],
  [true, 'hover'],
  [true, 'focus'],
  [true, 'pressed'],
]
function browser() {
  return {
    schema: 1,
    passed: true,
    sourceCommit: commit,
    scope: 'web-computed-style-real-pointer-focus',
    observations: ['candidate', 'tailwind'].flatMap((kind) =>
      states.map(([interactive, state]) => ({
        kind,
        interactive,
        state,
        selected: {
          paddingTop: '16px',
          width: '32px',
          opacity: '1',
          backgroundColor: 'rgb(34, 51, 68)',
        },
      })),
    ),
  }
}
test('inventory stays separate from scoped evidence and missing global measures are not zero', () => {
  const report = stylingFactStatus({ commit, receipts: [browser()] })
  assert.deepEqual(report.inventory, {
    components: 27,
    slots: 100,
    pendingOwners: 56,
    componentManaged: 33,
    componentManagedPending: 33,
    shadowContributions: 2,
    shadowAuditUnknown: 2,
  })
  assert.equal(report.observations[0].status, 'measured')
  assert.equal(report.observations[0].matchedPairs, 5)
  for (const key of ['coverage', 'fidelity', 'diagnosed', 'contractAudit'])
    assert.equal(report.globalMeasures[key], null)
  assert.equal(report.rollout, 'not-established-by-this-report')
})
test('stale, failed, incomplete, duplicate and mismatched receipts never become a pass', () => {
  for (const [receipt, status] of [
    [null, 'missing'],
    [{ ...browser(), sourceCommit: 'b'.repeat(40) }, 'stale'],
    [{ ...browser(), passed: false }, 'failed'],
    [{ ...browser(), trackedChanges: true }, 'uncommitted'],
    [{ ...browser(), sourceCommit: undefined }, 'invalid'],
    [{ ...browser(), observations: [] }, 'invalid'],
    [{ ...browser(), observations: Array(10).fill(browser().observations[0]) }, 'invalid'],
  ])
    assert.equal(stylingFactStatus({ commit, receipts: [receipt] }).observations[0].status, status)
  const mismatch = browser()
  mismatch.observations[0].selected.opacity = '0'
  assert.equal(
    stylingFactStatus({ commit, receipts: [mismatch] }).observations[0].status,
    'invalid',
  )
})
test('bundle deltas are derived from measured rows, not trusted headline or inventory numbers', () => {
  const receipt = {
    schema: 1,
    passed: true,
    sourceCommit: commit,
    scope: 'explicit-component-bundle-react-native-peers-external',
    delta: { bytes: -99999 },
    measurements: [
      { mode: 'opaque', bytes: 1000, gzipBytes: 400, sha256: 'a'.repeat(64) },
      { mode: 'prepared', bytes: 1100, gzipBytes: 410, sha256: 'b'.repeat(64) },
    ],
  }
  assert.deepEqual(stylingFactStatus({ commit, receipts: [receipt] }).observations[0].delta, {
    bytes: 100,
    gzipBytes: 10,
  })
  receipt.measurements[1].bytes = -1
  assert.equal(stylingFactStatus({ commit, receipts: [receipt] }).observations[0].status, 'invalid')
})

test('prepared browser rows require their own provenance and complete pairs without promoting global coverage', () => {
  const receipt = browser()
  receipt.controls = ['candidate', 'tailwind', 'prepared'].flatMap((kind) =>
    [false, true].map((interactive) => ({ kind, interactive, absentStylesheetDetected: true })),
  )
  receipt.prepared = {
    identity: {
      owner: 'BottomSheet.handle',
      platform: 'web',
      classProp: 'handleClassName',
      manifestSha256: 'b'.repeat(64),
    },
    fingerprint: 'test-context',
    preparations: 1,
  }
  receipt.observations.push(
    ...receipt.observations
      .filter((row) => row.kind === 'candidate')
      .map((row) => ({ ...row, kind: 'prepared' })),
  )
  const result = stylingFactStatus({ commit, receipts: [receipt] })
  assert.equal(result.observations[0].status, 'measured')
  assert.equal(result.observations[0].matchedPairs, 10)
  assert.equal(result.observations[0].denominator, 10)
  assert.equal(result.globalMeasures.contractAudit, null)
  assert.equal(result.globalMeasures.coverage, null)
  for (const change of [
    (value) => {
      value.prepared.identity.platform = 'ios'
    },
    (value) => {
      value.prepared.identity.manifestSha256 = ''
    },
    (value) => {
      value.observations.pop()
    },
    (value) => {
      value.controls.pop()
    },
    (value) => {
      value.controls[0] = null
    },
    (value) => {
      value.observations[0] = null
    },
    (value) => {
      value.prepared = null
    },
    (value) => {
      value.observations.find((row) => row.kind === 'prepared').selected = { paddingTop: '0px' }
    },
  ]) {
    const bad = structuredClone(receipt)
    change(bad)
    assert.equal(stylingFactStatus({ commit, receipts: [bad] }).observations[0].status, 'invalid')
  }
})
