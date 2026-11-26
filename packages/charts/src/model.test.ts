import assert from 'node:assert/strict'
import { test } from 'node:test'
import { barChartModel, estimateTextWidth, lineChartModel, linePath, type Mark, valueOf } from './model.ts'

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
  assert.equal(valueOf({ v: null }, 'v'), undefined)
  assert.equal(valueOf({ v: '3' }, 'v'), undefined)
  assert.equal(valueOf({ v: Number.NaN }, 'v'), undefined)
  assert.equal(valueOf({ v: 0 }, 'v'), 0)
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
    if (value >= 0) assert.ok(Math.abs(bar.y + bar.height - zero) < 1e-9, `bar ${bar.datum} ends on zero`)
    else assert.ok(Math.abs(bar.y - zero) < 1e-9, 'a negative bar hangs from zero')
  }
  const [online, store] = bars(model.marks)
  assert.ok(online && store && online.kind === 'bar' && store.kind === 'bar')
  assert.ok(Math.abs(online.x + online.width - store.x) < 1e-9, 'series sit side by side in a group')
})

test('stacked bars stack positives up and negatives down, and the domain is the largest sum', () => {
  const model = barChartModel({ ...base, stacked: true })
  const jan = bars(model.marks).filter((mark) => mark.kind === 'bar' && mark.datum === 0)
  assert.equal(jan.length, 2)
  const [first, second] = jan
  assert.ok(first?.kind === 'bar' && second?.kind === 'bar')
  assert.ok(Math.abs(first.y - (second.y + second.height)) < 1e-9, 'the second series sits on the first')
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
  const wide = barChartModel({ ...base, margin: undefined, data: [{ month: 'a', online: 5_000_000 }] })
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
