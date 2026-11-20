import type { Meta, StoryObj } from '@storybook/react-native'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native'
import {
  HozoTable,
  HozoTableCell,
  HozoTableRow,
  tableSourceHash,
} from './.table-performance/table.native'
import { type TableSample, tablePerformanceProbe } from './table-performance-observer'

const COUNTS = [100, 500, 1000] as const
const WIDTHS = [64, 96, 96, 96]
const HEADERS = ['ID', 'Name', 'Region', 'Total']
const HEIGHT = 32
const VIEWPORT = 240
type Row = { id: string; cells: string[] }

function WindowRow({ item }: { item: Row }) {
  useLayoutEffect(() => tablePerformanceProbe.row(), [])
  return (
    <View style={{ flexDirection: 'row', height: HEIGHT }}>
      {item.cells.map((text, column) => (
        <View
          key={HEADERS[column]}
          style={{ width: WIDTHS[column], padding: 4 }}
          onLayout={() => tablePerformanceProbe.cellLayout(`${item.id}:${column}`)}
        >
          <Text numberOfLines={1} style={{ fontSize: 14, lineHeight: 24 }}>
            {text}
          </Text>
        </View>
      ))}
    </View>
  )
}

// A measurement-only fixed-width control. This deliberately does not claim a
// public WindowedTable API or accessible table semantics for FlatList's Views.
function WindowedControl({ rows }: { rows: Row[] }) {
  useLayoutEffect(() => tablePerformanceProbe.resolved(), [])
  return (
    <FlatList
      style={{ height: VIEWPORT, flexGrow: 0 }}
      data={rows}
      keyExtractor={(row) => row.id}
      renderItem={({ item }) => <WindowRow item={item} />}
      ListHeaderComponent={<WindowRow item={{ id: 'header', cells: HEADERS }} />}
      initialNumToRender={8}
      maxToRenderPerBatch={8}
      windowSize={3}
      getItemLayout={(_, index) => ({ length: HEIGHT, offset: HEIGHT * (index + 1), index })}
    />
  )
}

function NormalControl({ rows }: { rows: Row[] }) {
  return (
    <ScrollView style={{ height: VIEWPORT, flexGrow: 0 }}>
      <HozoTable>
        {[{ id: 'header', cells: HEADERS }, ...rows].map((row) => (
          <HozoTableRow key={row.id}>
            {row.cells.map((text, column) => (
              <HozoTableCell
                key={HEADERS[column]}
                head={row.id === 'header'}
                style={{ padding: 4, fontSize: 14, lineHeight: 24 }}
              >
                {text}
              </HozoTableCell>
            ))}
          </HozoTableRow>
        ))}
      </HozoTable>
    </ScrollView>
  )
}

function TablePerformance() {
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
      }
      console.info('[Hozo Table timing]', JSON.stringify(record))
      setStatus(`${selection.name}: ${record.passed ? 'complete' : 'timeout'}`)
    }
    frame = requestAnimationFrame(next)
    return () => cancelAnimationFrame(frame)
  }, [selection])

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
      <Text>{status}</Text>
      {selection && (
        <View key={selection.name}>
          {selection.mode === 'normal' ? (
            <NormalControl rows={fixtures.get(selection.count) ?? []} />
          ) : (
            <WindowedControl rows={fixtures.get(selection.count) ?? []} />
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
