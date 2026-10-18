import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { captureTextBaseline, classifyObservation } from './text-inheritance-baseline.ts'
import { compareTextBaselines } from './text-inheritance-comparison.ts'
import { TEXT_PROPERTIES } from './text-inheritance-fixtures.ts'

let captured: ReturnType<typeof captureTextBaseline>
const report = () => (captured ??= captureTextBaseline(4))

test('inheritance inventory matches the Native compiler rather than arbitrary TextStyle keys', () => {
  const rust = readFileSync(
    new URL('../../../crates/hozo_native/src/text.rs', import.meta.url),
    'utf8',
  )
  const body = /fn is_text_property\([\s\S]*?\n}/.exec(rust)?.[0]
  assert.ok(body)
  const variants = [...body.matchAll(/StyleProperty::(\w+)/g)].map((match) => match[1])
  assert.deepEqual(variants.sort(), Object.keys(TEXT_PROPERTIES).sort())
  assert.equal(Object.keys(TEXT_PROPERTIES).length, 7)
})

test('known gaps are mismatches against intended values, and a fix becomes supported', () => {
  assert.deepEqual(classifyObservation({ color: '#123456', fontSize: 20 }, {}), {
    status: 'gap',
    mismatches: [
      { property: 'color', expected: '#123456', actual: null },
      { property: 'fontSize', expected: 20, actual: null },
    ],
  })
  assert.deepEqual(classifyObservation({ color: '#123456' }, { color: '#123456' }), {
    status: 'supported',
    mismatches: [],
  })
  assert.equal(classifyObservation({ fontSize: 20 }, { fontSize: 21 }).status, 'gap')
})

test('existing-correct static/direct/manifest/dynamic/relative cases remain correct', () => {
  const result = report()
  assert.equal(result.measurementValid, true, JSON.stringify(result.summary))
  assert.equal(result.cases.length, 10)
  assert.equal(new Set(result.cases.map((entry) => entry.id)).size, 10)
  assert.equal(result.summary.supported + result.summary.gaps, result.cases.length)
  assert.deepEqual(result.summary.regressions, [])
  for (const entry of result.cases) {
    for (const stage of entry.stages) {
      assert.deepEqual(
        { status: stage.status, mismatches: stage.mismatches },
        classifyObservation(stage.expected, stage.actual),
      )
      if (entry.required) assert.equal(stage.status, 'supported', entry.id)
    }
    // Do not pin gaps: correcting an opaque case must improve the report.
    // But do not silently omit its expected values or stages either.
    assert.ok(entry.stages.every((stage) => Object.keys(stage.expected).length > 0))
    for (const counts of Object.values(entry.lifetime)) assert.equal(counts.mounts, counts.unmounts)
  }
  const closed = result.cases.find((entry) => entry.id === 'closed-static-seven-properties')!
  assert.equal(Object.keys(closed.stages[0].expected).length, 7)
  for (const module of Object.values(closed.modules)) {
    assert.doesNotMatch(
      (module as { transformed: string }).transformed,
      /HozoText|HozoRelativeText/,
    )
  }
})

test('stable children, reconstructed children and owner events are measured separately', () => {
  const workload = report().workloads[0]
  assert.equal(workload.rows, 4)
  const operations = Object.fromEntries(workload.operations.map((entry) => [entry.name, entry]))
  assert.equal(operations.mount.textExecutions['label-0'].renders, 1)
  assert.equal(operations.mount.textExecutions['label-0'].mounts, 1)
  for (const counts of Object.values(operations['stable-children-parent-update'].textExecutions)) {
    assert.equal(counts.renders, 0)
    assert.equal(counts.mounts, 0)
  }
  assert.deepEqual(operations['stable-children-parent-update'].cellCommits, {})
  for (const counts of Object.values(
    operations['reconstructed-children-parent-update'].textExecutions,
  )) {
    assert.equal(counts.renders, 1, 'ordinary parent work must not be labeled context propagation')
    assert.equal(counts.mounts, 0)
    assert.equal(counts.unmounts, 0)
  }
  for (const name of ['one-button-press', 'one-button-release']) {
    assert.equal(operations[name].textExecutions['label-0'].renders, 1)
    assert.deepEqual(operations[name].cellCommits, { 0: 1 })
    for (const [id, counts] of Object.entries(operations[name].textExecutions)) {
      if (id !== 'label-0') assert.equal(counts.renders, 0, 'unaffected sibling')
      assert.equal(counts.mounts, 0)
      assert.equal(counts.unmounts, 0)
    }
  }
  assert.equal(workload.pressedColor, '#2b7fff')
  assert.equal(workload.restoredColor, '#fb2c36')
  assert.equal(workload.retainedHost, true)
  for (const counts of Object.values(operations.unmount.textExecutions))
    assert.equal(counts.unmounts, 1)
})

test('evidence carries code sizes, exact sources, binary provenance and limits', () => {
  const result = report()
  assert.match(result.provenance.sourceCommit, /^[a-f0-9]{40}$/)
  assert.match(result.provenance.fixtureHash, /^[a-f0-9]{64}$/)
  assert.match(result.provenance.binarySha256, /^[a-f0-9]{64}$/)
  assert.ok(result.methodology.excluded.includes('device performance'))
  assert.ok(result.methodology.excluded.includes('context subscription counts'))
  for (const entry of result.cases) {
    for (const module of Object.values(entry.modules)) {
      const record = module as {
        transformed: string
        source: string
        transformedBytes: number
        minifiedModuleBytes: number
      }
      assert.equal(record.transformedBytes, Buffer.byteLength(record.transformed))
      assert.ok(record.minifiedModuleBytes > 0)
      assert.ok(record.source.length > 0)
    }
  }
})

test('paired comparisons retain zero deltas and reject incomplete or incompatible evidence', () => {
  const result = report()
  const comparison = compareTextBaselines(result, structuredClone(result))
  assert.deepEqual(comparison.changes, [])
  assert.equal(comparison.timingAssessed, false)
  assert.ok(
    comparison.codeSize.every(
      (entry) => entry.transformedBytesDelta === 0 && entry.minifiedModuleBytesDelta === 0,
    ),
  )
  for (const operation of comparison.executions) {
    assert.equal(operation.cellCommitDelta, 0)
    for (const counts of Object.values(operation.textExecutionDeltas))
      assert.ok(Object.values(counts).every((count) => count === 0))
  }
  for (const mutate of [
    (copy: typeof result) => {
      copy.schemaVersion = 1
    },
    (copy: typeof result) => {
      copy.provenance.fixtureHash = 'other'
    },
    (copy: typeof result) => {
      copy.provenance.driverHash = 'other'
    },
    (copy: typeof result) => {
      copy.provenance.react = 'other'
    },
    (copy: typeof result) => {
      copy.cases.pop()
    },
    (copy: typeof result) => {
      copy.cases[0].stages.pop()
    },
    (copy: typeof result) => {
      copy.cases[0].stages[0].actual.color = null
    },
    (copy: typeof result) => {
      copy.workloads[0].operations.pop()
    },
    (copy: typeof result) => {
      delete copy.workloads[0].operations[0].textExecutions['label-0']
    },
    (copy: typeof result) => {
      copy.workloads[0].operations[0].textExecutions['label-0'].mounts = -1
    },
    (copy: typeof result) => {
      copy.workloads[0].rows = 3
    },
  ]) {
    const copy = structuredClone(result)
    mutate(copy)
    assert.throws(() => compareTextBaselines(result, copy))
  }
})

test('a coherent semantic regression, its fix and additional render work remain visible', () => {
  const current = report()
  const changed = structuredClone(current)
  changed.cases[0].stages[0].actual.color = '#incorrect'
  for (const entry of changed.cases)
    for (const stage of entry.stages)
      Object.assign(stage, classifyObservation(stage.expected, stage.actual))
  changed.summary.supported -= 1
  changed.summary.gaps += 1
  changed.summary.regressions.push(changed.cases[0].id)
  changed.measurementValid = false
  changed.compatibilityComplete = false
  changed.workloads[0].operations[3].textExecutions['label-0'].renders += 1
  const regression = compareTextBaselines(current, changed)
  assert.deepEqual(regression.changes, [
    {
      case: 'closed-static-seven-properties',
      stage: 'mount',
      property: 'color',
      change: 'regressed',
    },
  ])
  assert.equal(regression.executions[3].textExecutionDeltas['label-0'].renders, 1)
  assert.equal(regression.requiresReview, true)
  assert.equal(regression.timingAssessed, false)
  assert.deepEqual(compareTextBaselines(changed, current).changes, [
    { case: 'closed-static-seven-properties', stage: 'mount', property: 'color', change: 'fixed' },
  ])
})
