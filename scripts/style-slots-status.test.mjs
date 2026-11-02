import assert from 'node:assert/strict'
import test from 'node:test'
import { auditOwnerInputs } from './style-slots/owner-input-audit.mjs'
import {
  expectedIdleTabInputs,
  expectedTabModality,
  handleInputCases,
  tabInputCases,
  tabModalityCases,
} from './style-slots/owner-input-cases.mjs'
import { stylingFactStatus } from './style-slots/status.mjs'

const commit = 'a'.repeat(40)

// Synthetic rows test the report's refusal rules only. They are not runtime
// evidence; CI's command reads the actual component/browser receipt files.
function inputReceipts() {
  const base = (scope) => ({
    schema: 1,
    scope,
    passed: true,
    sourceCommit: commit,
    trackedChanges: false,
  })
  const prepared = (owner) => ({
    identity: { owner, platform: 'web', manifestSha256: 'b'.repeat(64) },
    fingerprint: 'test-context',
    delivery: 'composed-ordinary-lowering',
    preparations: 1,
    ordinaryParses: 1,
  })
  const selected = (input, web) => ({
    host: web ? (input.interactive ? 'BUTTON' : 'DIV') : input.interactive ? 'Pressable' : 'View',
    padding: 8,
    opacity: 1,
    rowGap: 16,
    columnGap: 16,
    background: '#ffffff',
  })
  const kinds = ['candidate', 'tailwind', 'prepared']
  return {
    sourceCommit: commit,
    nativeTabs: {
      ...base('native-tabs-compiled-owner-component-host-model'),
      stylesheetCreates: 1,
      requests: { opaque: 5, prepared: 0, caller: 0, instance: 0 },
      modalityObservations: ['opaque', 'prepared', 'caller', 'instance'].flatMap((route) =>
        tabModalityCases.map((input) => ({
          route,
          input: input.id,
          rows: expectedTabModality(input),
        })),
      ),
      inputObservations: ['opaque', 'prepared', 'caller', 'instance'].flatMap((route) =>
        tabInputCases.map((input) => ({
          route,
          input: input.id,
          rows: expectedIdleTabInputs(input),
        })),
      ),
    },
    webTabs: {
      ...base('web-tabs-real-pointer-focus'),
      prepared: prepared('Tabs.Tab'),
      modalityObservations: kinds.flatMap((kind) =>
        tabModalityCases.map((input) => ({
          kind,
          input: input.id,
          rows: expectedTabModality(input),
        })),
      ),
      controls: kinds.map((kind) => ({
        kind,
        blockedDisabledFocusAndClick: true,
        absentDisabledHooksDetected: true,
      })),
      inputObservations: kinds.flatMap((kind) =>
        tabInputCases.map((input) => ({
          kind,
          input: input.id,
          rows: expectedIdleTabInputs(input),
        })),
      ),
    },
    nativeHandle: {
      ...base('native-handle-normalized-live-input-host-model'),
      observations: ['android', 'ios'].flatMap((platform) =>
        ['opaque', 'caller'].flatMap((route) =>
          handleInputCases.map((input) => ({
            platform,
            route,
            input: input.id,
            selected: selected(input, false),
          })),
        ),
      ),
    },
    webHandle: {
      ...base('web-handle-normalized-live-inputs'),
      prepared: prepared('BottomSheet.handle'),
      controls: kinds.map((kind) => ({ kind, absentStylesheetDetected: true })),
      observations: kinds.flatMap((kind) =>
        handleInputCases.map((input, at) => ({
          kind,
          input: input.id,
          selected: selected(input, true),
          sameHost: input.interactive === (at ? handleInputCases[at - 1].interactive : false),
        })),
      ),
    },
  }
}

test('Owner input audit has finite denominators without self-promoting contracts or rollout', () => {
  const report = auditOwnerInputs(inputReceipts())
  assert.equal(report.passed, true)
  assert.deepEqual(
    report.domains.map(({ inputCases, nativeObservations, webObservations }) => [
      inputCases,
      nativeObservations,
      webObservations,
    ]),
    [
      [8, 32, 24],
      [9, 36, 27],
    ],
  )
  assert.equal(report.contractAudit, 'unknown')
  assert.deepEqual(report.domains[0].modality, {
    cases: 8,
    nativeObservations: 32,
    webObservations: 24,
  })
  assert.equal(report.rollout, 'unchanged')
})

test('Owner input audit rejects stale, dirty, failed or missing evidence on either platform', () => {
  for (const name of ['nativeTabs', 'webTabs', 'nativeHandle', 'webHandle']) {
    for (const change of [
      null,
      { sourceCommit: 'c'.repeat(40) },
      { trackedChanges: true },
      { passed: false },
      { trackedChanges: undefined },
    ]) {
      const input = inputReceipts()
      input[name] = change === null ? null : { ...input[name], ...change }
      assert.equal(auditOwnerInputs(input).passed, false, `${name}: ${JSON.stringify(change)}`)
    }
  }
  assert.equal(auditOwnerInputs({ ...inputReceipts(), trackedChanges: true }).passed, false)
})

test('Owner input audit requires every route, real delivery values, lifetime and negative controls', () => {
  for (const mutate of [
    (input) => input.nativeTabs.inputObservations.pop(),
    (input) => input.nativeTabs.modalityObservations.pop(),
    (input) => {
      input.webTabs.modalityObservations[1].rows[1].bottom = 0
    },
    (input) => {
      input.nativeTabs.modalityObservations[1].rows[1].decoration = 'none'
    },
    (input) => {
      input.webTabs.modalityObservations[7] = input.webTabs.modalityObservations[6]
    },
    (input) => {
      input.webTabs.inputObservations[1] = input.webTabs.inputObservations[0]
    },
    (input) => {
      input.nativeTabs.inputObservations[0].rows[0].selected = false
    },
    (input) => {
      input.nativeHandle.observations[3].selected.host = 'Pressable'
    },
    (input) => {
      input.webHandle.observations[5].sameHost = true
    },
    (input) => {
      input.webHandle.observations[5].selected.padding = 0
    },
    (input) => {
      input.webTabs.prepared.identity.owner = 'BottomSheet.handle'
    },
    (input) => {
      input.webTabs.prepared.delivery = 'manual-wiring'
    },
    (input) => {
      input.webHandle.controls[0].absentStylesheetDetected = false
    },
    (input) => {
      input.webTabs.controls[0].blockedDisabledFocusAndClick = false
    },
    (input) => {
      input.nativeTabs.requests.instance = 1
    },
    (input) => {
      input.nativeTabs.stylesheetCreates = 2
    },
  ]) {
    const input = inputReceipts()
    mutate(input)
    assert.equal(auditOwnerInputs(input).passed, false)
  }
})
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
  receipt.prepared.delivery = 'composed-ordinary-lowering'
  receipt.prepared.ordinaryParses = 1
  assert.equal(
    stylingFactStatus({ commit, receipts: [receipt] }).observations[0].status,
    'measured',
  )
  for (const changed of [
    { ...receipt.prepared, ordinaryParses: 2 },
    { ...receipt.prepared, delivery: 'explicit-preview-only' },
    { ...receipt.prepared, delivery: undefined },
    { ...receipt.prepared, ordinaryParses: undefined },
  ])
    assert.equal(
      stylingFactStatus({ commit, receipts: [{ ...receipt, prepared: changed }] }).observations[0]
        .status,
      'invalid',
    )
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
