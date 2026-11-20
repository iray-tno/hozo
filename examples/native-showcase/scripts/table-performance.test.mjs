import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  assertReusableTableInputs,
  tableSummary,
  tableTimingRecords,
  verifyTableSample,
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
    'docs/rfcs/014-windowed-table.md',
  ])
  for (const path of [
    'examples/native-showcase/src/TablePerformance.stories.tsx',
    'examples/native-showcase/src/table-performance-observer.ts',
    'examples/native-showcase/scripts/table-performance-source.cjs',
    'packages/semantics/src/table.native.tsx',
    'packages/compiler/src/index.ts',
    'examples/native-showcase/metro.config.js',
    'pnpm-lock.yaml',
    '.github/workflows/native-showcase.yml',
  ]) {
    assert.throws(() => assertReusableTableInputs([path]), /binary input changed/)
  }
})
