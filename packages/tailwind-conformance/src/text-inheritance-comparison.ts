import assert from 'node:assert/strict'
import { type captureTextBaseline, classifyObservation } from './text-inheritance-baseline.ts'
import { TEXT_FIXTURES } from './text-inheritance-fixtures.ts'

type Report = ReturnType<typeof captureTextBaseline>

function validate(report: Report) {
  assert.equal(report.schemaVersion, 1)
  assert.deepEqual(
    report.cases.map((entry) => entry.id),
    TEXT_FIXTURES.map((entry) => entry.id),
  )
  for (const [index, entry] of report.cases.entries()) {
    const fixture = TEXT_FIXTURES[index]
    assert.equal(entry.required, fixture.required)
    assert.deepEqual(
      entry.stages.map((stage) => stage.name),
      fixture.stages.map((stage) => stage.name),
    )
    for (const [stageIndex, stage] of entry.stages.entries()) {
      assert.deepEqual(stage.expected, fixture.stages[stageIndex].expected)
      assert.deepEqual(
        { status: stage.status, mismatches: stage.mismatches },
        classifyObservation(stage.expected, stage.actual),
      )
    }
    assert.deepEqual(Object.keys(entry.modules).sort(), Object.keys(fixture.modules).sort())
    for (const [name, value] of Object.entries(entry.modules)) {
      const module = value as {
        source: string
        transformed: string
        transformedBytes: number
        minifiedModuleBytes: number
      }
      assert.equal(module.source, fixture.modules[name])
      assert.equal(module.transformedBytes, Buffer.byteLength(module.transformed))
      assert.ok(Number.isInteger(module.minifiedModuleBytes) && module.minifiedModuleBytes > 0)
    }
  }
  const supported = report.cases.filter((entry) =>
    entry.stages.every((stage) => stage.status === 'supported'),
  ).length
  const regressions = report.cases
    .filter((entry) => entry.required && entry.stages.some((stage) => stage.status === 'gap'))
    .map((entry) => entry.id)
  assert.deepEqual(report.summary, {
    cases: TEXT_FIXTURES.length,
    supported,
    gaps: TEXT_FIXTURES.length - supported,
    regressions,
  })
  assert.equal(report.measurementValid, regressions.length === 0)
  assert.equal(report.compatibilityComplete, supported === TEXT_FIXTURES.length)
  assert.equal(report.workloads.length, 1)
  for (const workload of report.workloads) {
    assert.ok(Number.isInteger(workload.rows) && workload.rows > 0 && workload.rows <= 1000)
    assert.deepEqual(
      workload.operations.map((operation) => operation.name),
      [
        'mount',
        'stable-children-parent-update',
        'reconstructed-children-parent-update',
        'one-button-press',
        'one-button-release',
        'unmount',
      ],
    )
    for (const operation of workload.operations) {
      assert.deepEqual(
        Object.keys(operation.textExecutions).sort(),
        Array.from({ length: workload.rows }, (_, index) => `label-${index}`).sort(),
      )
      for (const counts of Object.values(operation.textExecutions)) {
        assert.deepEqual(Object.keys(counts).sort(), ['mounts', 'renders', 'unmounts'])
        assert.ok(Object.values(counts).every((value) => Number.isInteger(value) && value >= 0))
      }
      for (const [id, value] of Object.entries(operation.cellCommits)) {
        assert.ok(/^(0|[1-9]\d*)$/.test(id) && Number(id) < workload.rows)
        assert.ok(Number.isInteger(value) && value >= 0)
      }
    }
    assert.deepEqual(Object.keys(workload.modules), ['scene'])
    const module = workload.modules.scene as {
      transformed: string
      transformedBytes: number
      minifiedModuleBytes: number
    }
    assert.equal(module.transformedBytes, Buffer.byteLength(module.transformed))
    assert.ok(Number.isInteger(module.minifiedModuleBytes) && module.minifiedModuleBytes > 0)
  }
}

/** Compare equal fixtures/instrumentation, not a claimed performance pass. */
export function compareTextBaselines(before: Report, after: Report) {
  validate(before)
  validate(after)
  for (const field of [
    'fixtureHash',
    'driverHash',
    'node',
    'platform',
    'arch',
    'react',
    'renderer',
    'esbuild',
  ] as const) {
    assert.equal(before.provenance[field], after.provenance[field], `incomparable ${field}`)
  }
  assert.deepEqual(before.methodology, after.methodology)
  const changes: { case: string; stage: string; property: string; change: string }[] = []
  const codeSize = []
  for (const [index, entry] of after.cases.entries()) {
    const previous = before.cases[index]
    for (const [stageIndex, stage] of entry.stages.entries()) {
      for (const [property, expected] of Object.entries(stage.expected)) {
        const wasCorrect = Object.is(previous.stages[stageIndex].actual[property], expected)
        const isCorrect = Object.is(stage.actual[property], expected)
        if (wasCorrect !== isCorrect)
          changes.push({
            case: entry.id,
            stage: stage.name,
            property,
            change: isCorrect ? 'fixed' : 'regressed',
          })
      }
    }
    assert.deepEqual(Object.keys(previous.modules).sort(), Object.keys(entry.modules).sort())
    for (const [name, value] of Object.entries(entry.modules)) {
      const current = value as { transformedBytes: number; minifiedModuleBytes: number }
      const old = previous.modules[name] as typeof current
      codeSize.push({
        case: entry.id,
        module: name,
        transformedBytesDelta: current.transformedBytes - old.transformedBytes,
        minifiedModuleBytesDelta: current.minifiedModuleBytes - old.minifiedModuleBytes,
      })
    }
  }
  const workload = after.workloads[0]
  assert.equal(before.workloads[0].rows, workload.rows, 'incomparable row count')
  const executions = workload.operations.map((operation, index) => {
    const previous = before.workloads[0].operations[index]
    return {
      operation: operation.name,
      textExecutionDeltas: Object.fromEntries(
        Object.entries(operation.textExecutions).map(([id, counts]) => [
          id,
          Object.fromEntries(
            Object.entries(counts).map(([key, value]) => [
              key,
              value - previous.textExecutions[id][key],
            ]),
          ),
        ]),
      ),
      cellCommitDelta:
        Object.values(operation.cellCommits).reduce((sum, value) => sum + value, 0) -
        Object.values(previous.cellCommits).reduce((sum, value) => sum + value, 0),
    }
  })
  for (const [name, value] of Object.entries(workload.modules)) {
    const current = value as { transformedBytes: number; minifiedModuleBytes: number }
    const old = before.workloads[0].modules[name] as typeof current
    assert.ok(old, `missing workload module ${name}`)
    codeSize.push({
      case: 'workload',
      module: name,
      transformedBytesDelta: current.transformedBytes - old.transformedBytes,
      minifiedModuleBytesDelta: current.minifiedModuleBytes - old.minifiedModuleBytes,
    })
  }
  return { changes, codeSize, executions, timingAssessed: false, requiresReview: true }
}
