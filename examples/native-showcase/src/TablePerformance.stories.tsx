import { HozoTextSizeContext } from '@hozo/engine/generated/text-size-context'
import type { Meta, StoryObj } from '@storybook/react-native'
import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native'
import {
  HozoTable,
  HozoTableCell,
  HozoTableRow,
  tableSourceHash,
} from './.table-performance/table.native'
import {
  WindowedTable,
  windowedModelHash,
  windowedSourceHash,
} from './.table-performance/windowed-table.native'
import { type TableSample, tablePerformanceProbe } from './table-performance-observer'

const COUNTS = [100, 500, 1000] as const
const WIDTHS = [64, 96, 96, 96]
const HEADERS = ['ID', 'Name', 'Region', 'Total']
const HEIGHT = 32
const VIEWPORT = 240
type Row = { id: string; cells: string[] }

const columns = HEADERS.map((header, index) => ({
  key: header,
  header,
  width: WIDTHS[index]!,
  getText: (row: Row) => row.cells[index]!,
}))
const getRowKey = (row: Row) => row.id

// The current production source with build-time observation hooks, not the
// earlier FlatList prototype. The generator's round-trip test guards this.
const WindowedControl = memo(function WindowedControl({
  rows,
  rowHeight,
}: {
  rows: Row[]
  rowHeight: number
}) {
  return (
    <HozoTextSizeContext.Provider value={16}>
      <WindowedTable
        data={rows}
        columns={columns}
        getRowKey={getRowKey}
        rowHeight={rowHeight}
        maxHeight={VIEWPORT}
        accessibilityLabel="Orders"
      />
    </HozoTextSizeContext.Provider>
  )
})

const NormalControl = memo(function NormalControl({ rows }: { rows: Row[] }) {
  return (
    <ScrollView style={{ height: VIEWPORT, flexGrow: 0 }}>
      <HozoTable>
        {[{ id: 'header', cells: HEADERS }, ...rows].map((row) => (
          <HozoTableRow key={row.id}>
            {row.cells.map((text, column) => (
              <HozoTableCell
                key={HEADERS[column]}
                head={row.id === 'header'}
                style={{ padding: 4, fontSize: 16, lineHeight: 24 }}
              >
                {text}
              </HozoTableCell>
            ))}
          </HozoTableRow>
        ))}
      </HozoTable>
    </ScrollView>
  )
})

function TablePerformance() {
  const { fontScale } = useWindowDimensions()
  const rowHeight = HEIGHT * Math.max(1, fontScale)
  const [narrow, setNarrow] = useState(false)
  // Fixture allocation is outside the measured input handler for both modes.
  const fixtures = useMemo<Map<number, Row[]>>(
    () =>
      new Map(
        COUNTS.map((count) => [
          count,
          Array.from({ length: count }, (_, index) => ({
            id: String(index),
            cells: [
              String(index),
              `Item ${index}`,
              ['East', 'West'][index % 2],
              String(index * 17),
            ],
          })),
        ]),
      ),
    [],
  )
  const [selection, setSelection] = useState<TableSample | null>(null)
  const [status, setStatus] = useState('Ready')
  const serial = useRef(0)

  useLayoutEffect(() => {
    if (!selection) return
    let frame = 0
    let last = performance.now()
    let quiet = 0
    let quietSince = last
    let boundaryMs: number | null = null
    let previousWork = -1
    const next = () => {
      const now = performance.now()
      const work = selection.measurements + selection.cellLayouts + selection.mountedRows
      const complete =
        selection.mode === 'normal'
          ? selection.measuredCells.size === (selection.count + 1) * HEADERS.length &&
            selection.resolvedMs !== null
          : selection.laidOutCells.size >= 8 * HEADERS.length
      if (!complete || now - last > 34 || work !== previousWork) {
        quiet = 0
        quietSince = now
      } else quiet++
      if (complete && boundaryMs === null) boundaryMs = now - selection.started
      last = now
      previousWork = work
      const timedOut = now - selection.started > 30_000
      if (quiet < 30 && !timedOut) {
        frame = requestAnimationFrame(next)
        return
      }
      const record = {
        name: selection.name,
        mode: selection.mode,
        count: selection.count,
        boundary: 'columns-resolved-and-cell-layout-observed-plus-quiet-30-raf',
        passed: !timedOut && complete,
        boundaryMs,
        settledMs: quietSince - selection.started,
        observedMs: now - selection.started,
        resolvedMs: selection.resolvedMs,
        naturalMeasurements: selection.measurements,
        distinctNaturalCells: selection.measuredCells.size,
        peakRows: selection.peakRows,
        mountedRows: selection.mountedRows,
        cellLayouts: selection.cellLayouts,
        distinctLaidOutCells: selection.laidOutCells.size,
        sourceHash: tableSourceHash,
        windowedSourceHash,
        windowedModelHash,
        rowHeight,
        fontScale,
      }
      console.info('[Hozo Table timing]', JSON.stringify(record))
      setStatus(`${selection.name}: ${record.passed ? 'complete' : 'timeout'}`)
    }
    frame = requestAnimationFrame(next)
    return () => cancelAnimationFrame(frame)
  }, [selection, rowHeight, fontScale])

  return (
    <View style={{ flex: 1, gap: 8 }}>
      <Text>Table performance probe</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {COUNTS.flatMap((count) =>
          (['normal', 'windowed'] as const).map((mode) => (
            <Pressable
              key={`${mode}-${count}`}
              accessibilityRole="button"
              accessibilityLabel={`Mount ${mode} ${count}`}
              onPress={() => {
                const sample: TableSample = {
                  name: `${mode}-${count}-${++serial.current}`,
                  mode,
                  count,
                  started: performance.now(),
                  measurements: 0,
                  measuredCells: new Set(),
                  rows: 0,
                  peakRows: 0,
                  mountedRows: 0,
                  cellLayouts: 0,
                  laidOutCells: new Set(),
                  resolvedMs: null,
                  rowIndices: new Set(),
                }
                tablePerformanceProbe.sample = sample
                setStatus('Measuring')
                setSelection(sample)
              }}
            >
              <Text>
                {mode} {count}
              </Text>
            </Pressable>
          )),
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear table"
          onPress={() => {
            setSelection(null)
            tablePerformanceProbe.sample = null
            setStatus('Ready')
          }}
        >
          <Text>Clear table</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {(
          [
            [
              'Jump to last row',
              () =>
                tablePerformanceProbe.list?.scrollToIndex({
                  index: (selection?.count ?? 1) - 1,
                  animated: false,
                  viewPosition: 1,
                }),
            ],
            [
              'Return to first row',
              () => tablePerformanceProbe.list?.scrollToOffset({ offset: 0, animated: false }),
            ],
            ['Narrow table', () => setNarrow(true)],
            ['Wide table', () => setNarrow(false)],
            [
              'Record table window',
              () => {
                if (selection?.mode !== 'windowed') return
                console.info(
                  '[Hozo Table window]',
                  JSON.stringify({
                    name: selection.name,
                    count: selection.count,
                    sourceHash: tableSourceHash,
                    windowedSourceHash,
                    windowedModelHash,
                    rows: selection.rows,
                    peakRows: selection.peakRows,
                    mountedRows: selection.mountedRows,
                    indices: [...selection.rowIndices].sort((a, b) => a - b),
                    naturalMeasurements: selection.measurements,
                    rowHeight,
                    fontScale,
                    narrow,
                  }),
                )
              },
            ],
          ] as const
        ).map(([label, onPress]) => (
          <Pressable
            key={label}
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={onPress}
          >
            <Text>{label}</Text>
          </Pressable>
        ))}
      </View>
      <Text>{`Font scale ${fontScale.toFixed(2)}, row height ${rowHeight.toFixed(1)}`}</Text>
      <Text>{status}</Text>
      {selection && (
        <View key={selection.name} style={narrow ? { width: 220 } : undefined}>
          {selection.mode === 'normal' ? (
            <NormalControl rows={fixtures.get(selection.count) ?? []} />
          ) : (
            <WindowedControl rows={fixtures.get(selection.count) ?? []} rowHeight={rowHeight} />
          )}
        </View>
      )}
    </View>
  )
}

const meta = { title: 'Diagnostics/Table performance', component: TablePerformance } satisfies Meta<
  typeof TablePerformance
>
export default meta
type Story = StoryObj<typeof meta>
export const Matrix: Story = {}
