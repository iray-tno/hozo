import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { PNG } from 'pngjs'
import {
  assertReusableTableInputs,
  tableSummary,
  tableTimingRecords,
  verifyTablePixels,
  verifyTableSample,
  verifyTableWindow,
} from './table-performance-evidence.mjs'
import generator from './table-performance-source.cjs'

test('baseline instrumentation retains the current Table algorithm and fails on ambiguous anchors', () => {
  const source = readFileSync(
    new URL('../../../packages/semantics/src/table.native.tsx', import.meta.url),
    'utf8',
  )
  for (const original of [
    source.replaceAll('\r\n', '\n'),
    source.replaceAll('\r\n', '\n').replaceAll('\n', '\r\n'),
  ]) {
    const { hash, output } = generator.instrumentTableSource(original)
    assert.equal(hash, createHash('sha256').update(original).digest('hex'))
    const restored = output
      .replace('  useMemo,\n  useLayoutEffect,', '  useMemo,')
      .replace(
        '  useLayoutEffect(() => {\n    if (!measuring) tablePerformanceProbe.resolved()\n  }, [measuring])\n\n',
        '',
      )
      .replace('      tablePerformanceProbe.measure(key)\n', '')
      .replace(
        '  useLayoutEffect(() => tablePerformanceProbe.row(), [])\n  let column = 0\n  return (',
        '  let column = 0\n  return ('.replaceAll('\n', original.includes('\r\n') ? '\r\n' : '\n'),
      )
    assert.equal(restored, original)
  }
  assert.throws(
    () =>
      generator.instrumentTableSource(
        source.replace('measured.current.set(key, { column, width })', 'changed()'),
      ),
    /anchor changed/,
  )
  assert.throws(
    () => generator.instrumentTableSource(`${source}\n  const info: ColumnInfo`),
    /anchor changed/,
  )
})

test('production WindowedTable observations round-trip to the exact source under either line ending', () => {
  const source = readFileSync(
    new URL('../../../packages/patterns/src/windowed-table.native.tsx', import.meta.url),
    'utf8',
  )
  for (const eol of ['\n', '\r\n']) {
    const original = source.replaceAll('\r\n', '\n').replaceAll('\n', eol)
    const { hash, output } = generator.instrumentWindowedTableSource(original)
    assert.equal(hash, createHash('sha256').update(original).digest('hex'))
    const restored = output
      .replace("useContext, useLayoutEffect } from 'react'", "useContext } from 'react'")
      .replace(
        `  useLayoutEffect(() => columnIndex === 0 ? tablePerformanceProbe.row(rowIndex) : undefined, [])${eol}`,
        '',
      )
      .replace(
        `      onLayout={() => tablePerformanceProbe.cellLayout(\`\${rowIndex}:\${columnIndex}\`)}${eol}`,
        '',
      )
      .replace(`${eol}  useLayoutEffect(() => { tablePerformanceProbe.resolved() }, [])`, '')
      .replace(`        ref={(list) => { tablePerformanceProbe.list = list }}${eol}`, '')
    assert.equal(restored, original)
  }
  assert.throws(
    () =>
      generator.instrumentWindowedTableSource(
        source.replace('        data={data}', '        data={changed}'),
      ),
    /anchor changed/,
  )
  assert.throws(
    () => generator.instrumentWindowedTableSource(`${source}\n        data={data}`),
    /anchor changed/,
  )
})

test('production snapshots bind both source hashes, unique absolute rows and bounded recycling', () => {
  const expected = {
    count: 1000,
    windowedSourceHash: 'source',
    windowedModelHash: 'model',
    includes: [1000],
    excludes: [500],
  }
  const sample = {
    count: 1000,
    windowedSourceHash: 'source',
    windowedModelHash: 'model',
    naturalMeasurements: 0,
    rows: 3,
    peakRows: 24,
    mountedRows: 50,
    indices: [0, 1, 1000],
  }
  verifyTableWindow(sample, expected)
  assert.deepEqual(
    tableTimingRecords(`[Hozo Table window] ${JSON.stringify(sample)}`, '[Hozo Table window]'),
    [sample],
  )
  for (const change of [
    { windowedSourceHash: 'stale' },
    { windowedModelHash: 'stale' },
    { naturalMeasurements: 1 },
    { rows: 0 },
    { peakRows: 1001 },
    { mountedRows: 2 },
    { indices: [0, 1, 1] },
    { indices: [0, 1, 1001] },
    { indices: [0, 1, 500] },
  ]) {
    assert.throws(() => verifyTableWindow({ ...sample, ...change }, expected))
  }
})

test('missing, truncated, zero-work and unfinished observations cannot pass as cheap mounts', () => {
  assert.deepEqual(tableTimingRecords('unrelated log'), [])
  const payload = { name: 'normal-100-1', mode: 'normal', count: 100 }
  assert.deepEqual(
    tableTimingRecords(
      `I/ReactNativeJS(2897): '[Hozo Table timing]', '${JSON.stringify(payload)}'`,
    ),
    [payload],
  )
  assert.deepEqual(tableTimingRecords(`[Hozo Table timing] ${JSON.stringify(payload)}`), [payload])
  assert.throws(() => tableTimingRecords('[Hozo Table timing] {"passed":'), SyntaxError)
  const expected = { mode: 'normal', count: 100, sourceHash: 'actual-source' }
  const sample = {
    ...expected,
    passed: true,
    boundaryMs: 20,
    settledMs: 40,
    observedMs: 550,
    resolvedMs: 15,
    naturalMeasurements: 404,
    distinctNaturalCells: 404,
    peakRows: 101,
    mountedRows: 101,
  }
  verifyTableSample(sample, expected)
  for (const changed of [
    { passed: false },
    { naturalMeasurements: 0 },
    { distinctNaturalCells: 400 },
    { peakRows: 0 },
    { mountedRows: 100 },
    { sourceHash: 'stale-source' },
    { boundaryMs: null },
  ]) {
    assert.throws(() => verifyTableSample({ ...sample, ...changed }, expected))
  }
  const windowed = {
    ...sample,
    mode: 'windowed',
    naturalMeasurements: 0,
    distinctNaturalCells: 0,
    peakRows: 24,
    mountedRows: 24,
    distinctLaidOutCells: 96,
    cellLayouts: 96,
  }
  const windowExpected = { ...expected, mode: 'windowed' }
  verifyTableSample(windowed, windowExpected)
  for (const changed of [
    { peakRows: 101, mountedRows: 101 },
    { peakRows: 0 },
    { distinctLaidOutCells: 0 },
    { resolvedMs: null },
  ]) {
    assert.throws(() => verifyTableSample({ ...windowed, ...changed }, windowExpected))
  }
  assert.throws(() => tableSummary([sample]), /incomplete/)
})

test('collector-only diagnostic reuse rejects all application, generator, dependency and workflow changes', () => {
  assertReusableTableInputs([
    'examples/native-showcase/scripts/table-performance-evidence.mjs',
    'packages/patterns/README.md',
    'docs/rfcs/014-windowed-table.md',
  ])
  for (const path of [
    'examples/native-showcase/src/TablePerformance.stories.tsx',
    'examples/native-showcase/src/table-performance-observer.ts',
    'examples/native-showcase/scripts/table-performance-source.cjs',
    'packages/semantics/src/table.native.tsx',
    'packages/patterns/src/windowed-table.native.tsx',
    'packages/patterns/src/windowed-table-types.ts',
    'packages/compiler/src/index.ts',
    'examples/native-showcase/metro.config.js',
    'pnpm-lock.yaml',
    '.github/workflows/native-showcase.yml',
  ]) {
    assert.throws(() => assertReusableTableInputs([path]), /binary input changed/)
  }
})

test('populated accessibility nodes cannot conceal blank header or first-row pixels', () => {
  const image = new PNG({ width: 80, height: 40 })
  image.data.fill(255)
  const labels = ['ID', 'Name', 'Region', 'Total']
  const values = ['0', 'Item 0', 'East', '0']
  const nodes = labels.flatMap((label, column) => [
    { text: label, rect: [column * 20, 0, column * 20 + 18, 10] },
    { text: values[column], rect: [column * 20, 20, column * 20 + 18, 30] },
  ])
  const fill = (rect, value) => {
    for (let y = rect[1] + 1; y < rect[1] + 4; y++) {
      for (let x = rect[0] + 1; x < rect[0] + 5; x++) {
        const at = (y * image.width + x) * 4
        image.data[at] = image.data[at + 1] = image.data[at + 2] = value
      }
    }
  }
  for (const node of nodes) fill(node.rect, 0)
  assert.equal(verifyTablePixels(PNG.sync.write(image), nodes).length, 8)
  fill(nodes[0].rect, 255)
  assert.throws(() => verifyTablePixels(PNG.sync.write(image), nodes), /empty pixels: ID/)
  fill(nodes[0].rect, 0)
  fill(nodes[1].rect, 255)
  assert.throws(() => verifyTablePixels(PNG.sync.write(image), nodes), /empty pixels: ID, 0/)
  const last = [{ 'content-desc': 'Total, 16983', rect: [60, 20, 78, 30] }]
  assert.equal(
    verifyTablePixels(PNG.sync.write(image), last, { index: 999, columns: [3], headers: false })
      .length,
    1,
  )
  assert.throws(
    () =>
      verifyTablePixels(PNG.sync.write(image), last, { index: 998, columns: [3], headers: false }),
    /missing unique Table row anchor/,
  )
})

test('repeated Region labels must belong to the uniquely anchored row, not clipped overscan', () => {
  const image = new PNG({ width: 80, height: 40 })
  image.data.fill(0)
  for (let at = 3; at < image.data.length; at += 4) image.data[at] = 255
  const total = { 'content-desc': 'Total, 16983', rect: [60, 20, 78, 30] }
  const clipped = { 'content-desc': 'Region, West', rect: [40, 20, 58, 4] }
  const earlier = { 'content-desc': 'Region, West', rect: [40, 0, 58, 10] }
  const current = { 'content-desc': 'Region, West', rect: [40, 20, 58, 30] }
  const options = { index: 999, columns: [2, 3], headers: false }
  const result = verifyTablePixels(
    PNG.sync.write(image),
    [clipped, earlier, current, total],
    options,
  )
  assert.deepEqual(
    result.map((cell) => cell.rect),
    [current.rect, total.rect],
  )
  assert.throws(
    () => verifyTablePixels(PNG.sync.write(image), [clipped, earlier, total], options),
    /missing Table node/,
  )
})
