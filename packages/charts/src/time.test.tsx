import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { LineChart, ScatterChart } from './index.tsx'
import { barChartModel, lineChartModel } from './model.ts'
import { logScale, logTicks, niceLogDomain } from './scale.ts'
import { chartSummary } from './summary.ts'
import { timeFormatter, timeTicks, timeValue } from './time.ts'

const utc = Date.UTC
const labels = (ticks: { label: string }[]) => ticks.map((tick) => tick.label)

test('time ticks fall on calendar boundaries, with the year where it turns', () => {
  const months = timeTicks(utc(2025, 10, 20), utc(2026, 4, 3), 6)
  assert.deepEqual(labels(months), ['Dec 2025', 'Jan 2026', 'Feb', 'Mar', 'Apr', 'May'])
  assert.ok(months.every((tick) => new Date(tick.value).getUTCDate() === 1))
  const days = timeTicks(utc(2026, 2, 1), utc(2026, 2, 6), 5)
  assert.deepEqual(labels(days), ['Mar 1', 'Mar 2', 'Mar 3', 'Mar 4', 'Mar 5', 'Mar 6'])
  const hours = timeTicks(utc(2026, 2, 1, 18), utc(2026, 2, 2, 6), 4)
  assert.deepEqual(labels(hours), ['Mar 1, 18:00', '21:00', 'Mar 2, 00:00', '03:00', '06:00'])
  const weeks = timeTicks(utc(2026, 2, 1), utc(2026, 3, 30), 10)
  assert.ok(
    weeks.every((tick) => new Date(tick.value).getUTCDay() === 1),
    'weeks start on a Monday',
  )
  const years = timeTicks(utc(2000, 5, 1), utc(2030, 0, 1), 4)
  assert.deepEqual(labels(years), ['2010', '2020', '2030'])
})

test('a row is read as a date, with the time only when some row has one', () => {
  assert.equal(timeValue('2026-03-01'), utc(2026, 2, 1))
  assert.equal(timeValue(new Date(utc(2026, 2, 1))), utc(2026, 2, 1))
  assert.equal(timeValue('soon'), undefined)
  assert.equal(timeFormatter([utc(2026, 2, 1)])(utc(2026, 2, 1)), 'Mar 1, 2026')
  const withTime = timeFormatter([utc(2026, 2, 1), utc(2026, 2, 1, 9, 30)])
  assert.equal(withTime(utc(2026, 2, 1, 9, 30)), 'Mar 1, 2026, 09:30')
})

const visits = [
  { day: '2026-03-01', v: 5 },
  { day: '2026-03-02', v: 50 },
  { day: '2026-03-10', v: 500 },
  { day: '2026-03-31', v: 5000 },
]
const input = {
  data: visits,
  x: { key: 'day', type: 'time' as const },
  series: [{ key: 'v', label: 'Visits' }],
  width: 600,
  height: 240,
}

test('a time axis places rows by when they happened', () => {
  const model = lineChartModel(input)
  const [a, b, c, d] = model.centers as [number, number, number, number]
  const day = (b - a) / 1
  assert.ok(Math.abs(c - a - day * 9) < 1e-6, 'nine days on, not two steps')
  assert.ok(Math.abs(d - a - day * 30) < 1e-6)
  assert.equal(a, model.plot.x)
  assert.equal(d, model.plot.x + model.plot.width)
  assert.deepEqual(model.categories, ['Mar 1, 2026', 'Mar 2, 2026', 'Mar 10, 2026', 'Mar 31, 2026'])
  assert.ok(model.xTicks.length >= 3)
  for (const tick of model.xTicks) assert.match(tick.label, /^Mar \d+$/)
  const sentence = chartSummary(model, input.series)
  assert.match(sentence, /^4 categories, Mar 1, 2026 to Mar 31, 2026\./)
  const bars = barChartModel(input)
  assert.equal(bars.categories[2], 'Mar 10, 2026', 'bars read dates too, one band each')
})

test('a row with no time is not drawn, and is still read', () => {
  const model = lineChartModel({ ...input, data: [...visits.slice(0, 2), { day: 'later', v: 7 }] })
  assert.ok(Number.isNaN(model.centers[2]))
  assert.equal(model.categories[2], 'later')
  assert.equal(model.datumAt(10_000), 1, 'the pointer never lands on it')
})

test('log ticks are powers of ten, with 2 and 5 between while they fit', () => {
  assert.deepEqual(logTicks(1, 100, 10), [1, 2, 5, 10, 20, 50, 100])
  assert.deepEqual(logTicks(1, 1e6, 10), [1, 10, 100, 1000, 10000, 100000, 1000000])
  assert.deepEqual(logTicks(1, 1e12, 4), [1, 10000, 100000000, 1000000000000])
  assert.deepEqual(logTicks(0.01, 1, 10), [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1])
  assert.deepEqual(niceLogDomain(5, 5000), [1, 10000])
  const y = logScale([1, 1000], [300, 0])
  assert.equal(y(10), 200)
  assert.ok(Number.isNaN(y(0)))
  assert.ok(Math.abs(y.invert(100) - 100) < 1e-9)
})

test('a log value axis spaces each tenfold step evenly, and says so', () => {
  const model = lineChartModel({ ...input, x: { key: 'day' }, y: { scale: 'log' } })
  const points = model.marks.flatMap((mark) => (mark.kind === 'point' ? [mark.cy] : []))
  const steps = points.slice(1).map((cy, i) => (points[i] as number) - cy)
  for (const step of steps) assert.ok(Math.abs(step - (steps[0] as number)) < 1e-6)
  assert.deepEqual(
    model.yTicks.map((tick) => tick.label),
    ['1', '10', '100', '1000', '10000'],
  )
  assert.match(chartSummary(model, input.series), /\. Values on a log scale\. Visits: lowest 5/)
  const zero = lineChartModel({
    ...input,
    x: { key: 'day' },
    y: { scale: 'log' },
    data: [...visits, { day: 'x', v: 0 }],
  })
  assert.equal(zero.marks.filter((mark) => mark.kind === 'point').length, 4, 'zero is not drawn')
  assert.equal(zero.values[0]?.[4], 0, 'and is still read')
  assert.equal(barChartModel({ ...input, y: { scale: 'log' } }).log, undefined, 'bars stay linear')
})

test('Line and Scatter take the scales as props', () => {
  const line = renderToStaticMarkup(
    <LineChart accessibilityLabel="Visits" {...input} y={{ scale: 'log' }} />,
  )
  assert.match(line, />Mar 1, 2026</)
  assert.match(line, />10000</)
  const scatter = renderToStaticMarkup(
    <ScatterChart
      accessibilityLabel="Size against price"
      data={[
        { price: 1, size: 10 },
        { price: 2, size: 1000 },
      ]}
      x={{ key: 'price' }}
      y={{ scale: 'log' }}
      series={[{ key: 'size', label: 'Size' }]}
      width={600}
      height={240}
    />,
  )
  assert.match(scatter, /Values on a log scale\./)
})
