import assert from 'node:assert/strict'

export const TABLE_COUNTS = [100, 500, 1000]

export function tableTimingRecords(log) {
  return log.split(/\r?\n/).flatMap((line) => {
    const at = line.indexOf('[Hozo Table timing] ')
    if (at < 0) return []
    // A truncated record must fail, rather than disappear into an empty sample.
    return [JSON.parse(line.slice(at + '[Hozo Table timing] '.length))]
  })
}

export function verifyTableSample(sample, { mode, count, sourceHash }) {
  assert.equal(sample.mode, mode)
  assert.equal(sample.count, count)
  assert.equal(sample.sourceHash, sourceHash, 'instrumented Table differs from checked-out source')
  assert.equal(sample.passed, true, 'Table did not finish within the observation window')
  for (const field of ['boundaryMs', 'settledMs', 'observedMs', 'resolvedMs']) {
    assert.ok(Number.isFinite(sample[field]) && sample[field] >= 0, `missing ${field}`)
  }
  assert.ok(sample.observedMs >= sample.boundaryMs)
  assert.ok(sample.observedMs >= sample.settledMs)
  if (mode === 'normal') {
    assert.equal(sample.distinctNaturalCells, (count + 1) * 4)
    assert.ok(sample.naturalMeasurements >= sample.distinctNaturalCells)
    assert.equal(sample.peakRows, count + 1)
    assert.equal(sample.mountedRows, count + 1)
  } else {
    assert.equal(sample.naturalMeasurements, 0)
    assert.equal(sample.distinctNaturalCells, 0)
    assert.ok(
      sample.peakRows >= 8 && sample.peakRows <= 48,
      'window mounted an unexpected row count',
    )
    assert.ok(sample.mountedRows >= sample.peakRows && sample.mountedRows < count)
    assert.ok(sample.distinctLaidOutCells >= 32)
    assert.ok(sample.cellLayouts >= sample.distinctLaidOutCells)
  }
}

export function tableSummary(cases) {
  const median = (values) => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)]
  return TABLE_COUNTS.flatMap((count) =>
    ['normal', 'windowed'].map((mode) => {
      const samples = cases.filter(
        (entry) => !entry.warmup && entry.mode === mode && entry.count === count,
      )
      assert.equal(samples.length, 3, `incomplete ${mode}/${count} matrix`)
      assert.ok(samples.every((sample) => sample.passed))
      return {
        count,
        mode,
        samples: samples.length,
        boundaryMedianMs: median(samples.map((sample) => sample.boundaryMs)),
        settledMedianMs: median(samples.map((sample) => sample.settledMs)),
        naturalMeasurements: samples.map((sample) => sample.naturalMeasurements),
        peakRows: samples.map((sample) => sample.peakRows),
      }
    }),
  )
}
