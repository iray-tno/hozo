import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  barChartModel,
  EDGE_PAD,
  edgeLabels,
  estimateTextWidth,
  lineChartModel,
  linePath,
  type Mark,
  rowValue,
} from './model.ts'

const sales = [
  { month: 'Jan', online: 120, store: 80 },
  { month: 'Feb', online: 200, store: null },
  { month: 'Mar', online: -40, store: 60 },
]
const base = {
  data: sales,
  x: { key: 'month' },
  series: [
    { key: 'online', label: 'Online' },
    { key: 'store', label: 'In store' },
  ],
  width: 400,
  height: 240,
  margin: { top: 10, right: 10, bottom: 30, left: 40 },
}
const bars = (marks: Mark[]) => marks.filter((mark) => mark.kind === 'bar')

test('a missing or non-numeric value is a gap, never zero', () => {
  assert.equal(rowValue({ v: null }, 'v'), undefined)
  assert.equal(rowValue({ v: '3' }, 'v'), undefined)
  assert.equal(rowValue({ v: Number.NaN }, 'v'), undefined)
  assert.equal(rowValue({ v: 0 }, 'v'), 0)
  const model = barChartModel(base)
  assert.deepEqual(model.values, [
    [120, 200, -40],
    [80, undefined, 60],
  ])
  assert.equal(bars(model.marks).length, 5, 'no bar where the store had no value')
})

test('grouped bars stand on zero, up for positives and down for negatives', () => {
  const model = barChartModel(base)
  const zero = model.yTicks.find((tick) => tick.label === '0')?.position
  assert.ok(zero !== undefined, 'zero is a tick')
  for (const bar of bars(model.marks)) {
    if (bar.kind !== 'bar') continue
    const value = model.values[bar.series]?.[bar.datum] as number
    if (value >= 0)
      assert.ok(Math.abs(bar.y + bar.height - zero) < 1e-9, `bar ${bar.datum} ends on zero`)
    else assert.ok(Math.abs(bar.y - zero) < 1e-9, 'a negative bar hangs from zero')
  }
  const [online, store] = bars(model.marks)
  assert.ok(online && store && online.kind === 'bar' && store.kind === 'bar')
  assert.ok(
    Math.abs(online.x + online.width + 2 - store.x) < 1e-9,
    'series sit side by side in a group, 2px apart',
  )
  assert.ok(online.width <= 24, 'no bar is thicker than 24px')
  assert.equal(online.end, 'top', 'a positive bar rounds its top')
})

test('stacked bars stack positives up and negatives down, and the domain is the largest sum', () => {
  const model = barChartModel({ ...base, stacked: true })
  const jan = bars(model.marks).filter((mark) => mark.kind === 'bar' && mark.datum === 0)
  assert.equal(jan.length, 2)
  const [first, second] = jan
  assert.ok(first?.kind === 'bar' && second?.kind === 'bar')
  assert.ok(
    Math.abs(first.y - (second.y + second.height) - 2) < 1e-9,
    'the second series sits on the first, 2px above it',
  )
  assert.equal(first.end, undefined, 'a covered segment has no rounded end')
  assert.equal(second.end, 'top', 'the top of the stack does')
  assert.ok(Number(model.yTicks.at(-1)?.label) >= 200, 'the axis reaches the largest stack (200)')
})

test('a line breaks at a gap rather than drawing across it', () => {
  assert.equal(linePath([[0, 0], [10, 5], undefined, [30, 1]]), 'M0,0L10,5M30,1')
  const model = lineChartModel(base)
  const store = model.marks.find((mark) => mark.kind === 'line' && mark.series === 1)
  assert.ok(store?.kind === 'line')
  assert.equal(store.path.split('M').length - 1, 2, 'two segments around the missing February')
  assert.equal(model.marks.filter((mark) => mark.kind === 'point').length, 5)
})

test('the nearest datum is found from any x, for pointer and touch', () => {
  const model = lineChartModel(base)
  assert.equal(model.datumAt(0), 0)
  assert.equal(model.datumAt(model.centers[1] as number), 1)
  assert.equal(model.datumAt(10_000), 2)
  assert.equal(lineChartModel({ ...base, data: [] }).datumAt(5), -1)
})

test('margins are estimated from the tick labels unless given', () => {
  const narrow = barChartModel({ ...base, margin: undefined, data: [{ month: 'a', online: 5 }] })
  const wide = barChartModel({
    ...base,
    margin: undefined,
    data: [{ month: 'a', online: 5_000_000 }],
  })
  assert.ok(wide.plot.x > narrow.plot.x, 'longer y labels take more room')
  assert.ok(estimateTextWidth('売上', 10) > estimateTextWidth('ab', 10), 'CJK is wider')
  assert.equal(barChartModel(base).plot.x, 40, 'a given margin wins')
})

test('crowded category labels are thinned, not overlapped', () => {
  const data = Array.from({ length: 60 }, (_, i) => ({ month: `Month ${i}`, online: i }))
  const model = barChartModel({ ...base, data })
  assert.ok(model.xTicks.length < 60)
  assert.equal(model.xTicks[0]?.label, 'Month 0')
})

test('an edge label stays inside the chart, and a neighbour it would touch is left out', () => {
  const data = Array.from({ length: 30 }, (_, i) => ({ day: `2026-11-${i + 1}`, v: i }))
  const model = lineChartModel({
    data,
    x: { key: 'day' },
    series: [{ key: 'v', label: 'Visits' }],
    width: 400,
    height: 200,
  })
  const last = model.xTicks.at(-1)
  assert.ok(last)
  const half = estimateTextWidth(last.label, 12) / 2
  assert.ok(last.position + half > 400, 'centred, it would run past the right edge')
  assert.equal(last.anchor, 'end')
  for (const [i, tick] of model.xTicks.entries()) {
    const width = estimateTextWidth(tick.label, 12)
    const [from, to] =
      tick.anchor === 'end'
        ? [400 - EDGE_PAD - width, 400 - EDGE_PAD]
        : [tick.position - width / 2, tick.position + width / 2]
    assert.ok(from >= 0 && to <= 400, `${tick.label} inside`)
    const next = model.xTicks[i + 1]
    if (next?.anchor === 'end')
      assert.ok(to < 400 - EDGE_PAD - estimateTextWidth(next.label, 12), 'no overlap at the edge')
  }
  const left = edgeLabels(
    [
      { position: 10, label: 'Long first' },
      { position: 200, label: 'b' },
    ],
    12,
    400,
  )
  assert.equal(left[0]?.anchor, 'start')
  const fits = edgeLabels(
    [
      { position: 100, label: 'a' },
      { position: 300, label: 'b' },
    ],
    12,
    400,
  )
  assert.deepEqual(
    fits.map((tick) => tick.anchor),
    [undefined, undefined],
    'nothing moves when it fits',
  )
})

test('an anchored label is drawn against the edge', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server')
  const { createElement } = await import('react')
  const { LineChart } = await import('./index.tsx')
  const html = renderToStaticMarkup(
    createElement(LineChart, {
      accessibilityLabel: 'Visits',
      data: Array.from({ length: 30 }, (_, i) => ({ day: `2026-11-${i + 1}`, v: i })),
      x: { key: 'day' },
      series: [{ key: 'v', label: 'Visits' }],
      width: 400,
      height: 200,
    }),
  )
  assert.match(
    html,
    new RegExp(`<text x="${400 - EDGE_PAD}"[^>]*text-anchor="end"[^>]*>2026-11-29<`),
  )
})
