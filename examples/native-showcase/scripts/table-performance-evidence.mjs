import assert from 'node:assert/strict'
import { PNG } from 'pngjs'

export const TABLE_COUNTS = [100, 500, 1000]

// Accessibility bounds can survive text disappearing after Native sizing.
// Observe the actual header/value pixels after the timing window as well.
export function verifyTablePixels(
  buffer,
  nodes,
  { index = 0, columns = [0, 1, 2, 3], headers = true } = {},
) {
  const image = PNG.sync.read(buffer)
  const labels = ['ID', 'Name', 'Region', 'Total']
  const values = [String(index), `Item ${index}`, index % 2 ? 'West' : 'East', String(index * 17)]
  const matches = (node, label) => node.text === label || node['content-desc'] === label
  const read = (node, label) => {
    assert.ok(node?.rect, `missing Table node: ${label}`)
    const [left, top, right, bottom] = node.rect
    assert.ok(
      left >= 0 &&
        top >= 0 &&
        right <= image.width &&
        bottom <= image.height &&
        right > left &&
        bottom > top,
      `invalid Table bounds: ${label}`,
    )
    let inkPixels = 0
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        const at = (y * image.width + x) * 4
        if (
          image.data[at] < 128 &&
          image.data[at + 1] < 128 &&
          image.data[at + 2] < 128 &&
          image.data[at + 3] > 0
        )
          inkPixels++
      }
    }
    assert.ok(inkPixels >= 10, `Table text has empty pixels: ${label}`)
    return { label, rect: node.rect, inkPixels }
  }
  if (!headers)
    return columns.map((column) => {
      const label = `${labels[column]}, ${values[column]}`
      return read(
        nodes.find((node) => matches(node, label)),
        label,
      )
    })
  const headerNodes = labels.map((label) => nodes.find((node) => matches(node, label)))
  const evidence = headerNodes.map((node, index) => read(node, labels[index]))
  for (let column = 0; column < labels.length; column++) {
    const [left, , right, bottom] = headerNodes[column].rect
    const label = `${labels[column]}, ${values[column]}`
    const node = nodes.find(
      (node) =>
        node.rect &&
        node.rect[1] >= bottom &&
        (node.rect[0] + node.rect[2]) / 2 >= left &&
        (node.rect[0] + node.rect[2]) / 2 <= right &&
        (matches(node, label) || matches(node, values[column])),
    )
    evidence.push(read(node, label))
  }
  return evidence
}

export function tableTimingRecords(log, marker = '[Hozo Table timing]') {
  return log.split(/\r?\n/).flatMap((line) => {
    const at = line.indexOf(marker)
    if (at < 0) return []
    // A truncated record must fail, rather than disappear into an empty sample.
    // Release RN quotes console arguments and separates them with a comma.
    const start = line.indexOf('{', at)
    const end = line.lastIndexOf('}')
    assert.ok(start >= at, 'timing record has no JSON payload')
    return [JSON.parse(line.slice(start, end >= start ? end + 1 : undefined))]
  })
}

export function assertReusableTableInputs(changed) {
  const collectors = new Set([
    'examples/native-showcase/scripts/table-performance.mjs',
    'examples/native-showcase/scripts/table-performance-evidence.mjs',
    'examples/native-showcase/scripts/table-performance.test.mjs',
    'examples/native-showcase/README.md',
  ])
  for (const path of changed) {
    assert.ok(
      collectors.has(path) || path.startsWith('docs/'),
      `Table binary input changed: ${path}`,
    )
  }
}

export function verifyTableSample(
  sample,
  { mode, count, sourceHash, windowedSourceHash, windowedModelHash },
) {
  assert.equal(sample.mode, mode)
  assert.equal(sample.count, count)
  assert.equal(sample.sourceHash, sourceHash, 'instrumented Table differs from checked-out source')
  if (windowedSourceHash !== undefined) assert.equal(sample.windowedSourceHash, windowedSourceHash)
  if (windowedModelHash !== undefined) assert.equal(sample.windowedModelHash, windowedModelHash)
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
    assert.equal(
      sample.distinctLaidOutCells,
      sample.peakRows * 4,
      'mounted cells did not all lay out',
    )
    assert.ok(sample.cellLayouts >= sample.distinctLaidOutCells)
  }
}

export function verifyTableWindow(
  sample,
  { count, windowedSourceHash, windowedModelHash, includes = [], excludes = [] },
) {
  assert.equal(sample.count, count)
  assert.equal(sample.windowedSourceHash, windowedSourceHash)
  assert.equal(sample.windowedModelHash, windowedModelHash)
  assert.equal(sample.naturalMeasurements, 0)
  assert.ok(sample.rows > 0 && sample.rows <= sample.peakRows && sample.peakRows <= 48)
  assert.ok(sample.mountedRows >= sample.peakRows)
  assert.equal(new Set(sample.indices).size, sample.rows)
  assert.equal(sample.indices.length, sample.rows)
  assert.ok(
    sample.indices.every((index) => Number.isInteger(index) && index >= 0 && index <= count),
  )
  for (const index of includes)
    assert.ok(sample.indices.includes(index), `row ${index} was not mounted`)
  for (const index of excludes)
    assert.ok(!sample.indices.includes(index), `row ${index} did not leave the window`)
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
