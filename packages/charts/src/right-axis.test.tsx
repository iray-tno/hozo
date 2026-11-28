import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { datumSentence } from './active.ts'
import { ComposedChart } from './index.tsx'
import { alignedSteps, type ComposedSeries, composedChartModel } from './model.ts'
import { chartSummary } from './summary.ts'

const data = [
  { month: 'Jan', revenue: 1200, rate: 0.021 },
  { month: 'Feb', revenue: 1800, rate: 0.034 },
  { month: 'Mar', revenue: 1500, rate: 0.048 },
]
const pct = (value: number) => `${Number((value * 100).toFixed(1))}%`
const series: ComposedSeries[] = [
  { key: 'revenue', label: 'Revenue' },
  { key: 'rate', label: 'Conversion', type: 'line', axis: 'right' },
]
const input = {
  data,
  x: { key: 'month' },
  y: { format: (value: number) => `$${value}` },
  y2: { format: pct },
  series,
  width: 480,
  height: 260,
}
const near = (a: number, b: number, by = 0.05) => Math.abs(a - b) < by

test('a round step that covers the range in a given number of steps', () => {
  assert.deepEqual(alignedSteps(0, 100, 4), { start: 0, step: 25 })
  assert.deepEqual(alignedSteps(0.021, 0.048, 4), { start: 0.02, step: 0.01 })
  assert.deepEqual(alignedSteps(3, 97, 5), { start: 0, step: 20 })
  assert.deepEqual(alignedSteps(-12, 30, 3), { start: -20, step: 20 })
  const { start, step } = alignedSteps(5, 5, 2)
  assert.ok(start <= 5 && start + step * 2 > 5, 'a flat series still gets a range')
})

test('the right axis’ ticks sit level with the left’s, so one set of gridlines serves both', () => {
  const model = composedChartModel(input)
  const right = model.rightAxis
  assert.ok(right)
  assert.deepEqual(right.series, [1])
  assert.deepEqual(
    right.ticks.map((tick) => tick.position),
    model.yTicks.map((tick) => tick.position),
  )
  // Lines alone need not start at zero: the rate is read close up.
  assert.equal(right.ticks[0]?.label, '2%')
  assert.ok(model.plot.x + model.plot.width + right.width <= model.width)
})

test('a right-axis line is drawn against the right scale, and bars against the left', () => {
  const model = composedChartModel(input)
  const right = model.rightAxis
  assert.ok(right)
  // The tick at each label's value is where a point of that value sits.
  const position = (label: string) => right.ticks.find((tick) => tick.label === label)?.position
  const feb = model.marks.find(
    (mark) => mark.kind === 'point' && mark.series === 1 && mark.datum === 1,
  )
  const at3 = position('3%')
  const at4 = position('4%')
  assert.ok(feb?.kind === 'point' && at3 !== undefined && at4 !== undefined)
  assert.ok(near(feb.cy, at3 + (at4 - at3) * 0.4, 0.1), '3.4% is four tenths of 3% to 4%')
  // The bars measure from the left axis' zero, the bottom of the plot.
  const [jan, febBar] = model.marks.filter((mark) => mark.kind === 'bar')
  assert.ok(jan?.kind === 'bar' && febBar?.kind === 'bar')
  assert.ok(near(febBar.height / jan.height, 1800 / 1200, 0.01))
  assert.ok(near(jan.y + jan.height, model.plot.y + model.plot.height, 0.5))
})

test('the key says which series is on the right axis', () => {
  const model = composedChartModel(input)
  assert.deepEqual(
    model.legend?.map((key) => key.label),
    ['Revenue', 'Conversion (right axis)'],
  )
})

test('each series is read in its own axis’ format, and the summary names the right axis', () => {
  const formatted = series.map((entry) =>
    entry.axis === 'right' ? { ...entry, format: pct } : entry,
  )
  const model = composedChartModel(input)
  assert.equal(
    datumSentence(model, formatted, 1, input.y.format),
    'Feb. Revenue: $1800. Conversion: 3.4%.',
  )
  assert.equal(
    chartSummary(model, formatted, input.y.format),
    '3 categories, Jan to Mar. Revenue: lowest $1200 at Jan, highest $1800 at Feb. ' +
      'Conversion: lowest 2.1% at Jan, highest 4.8% at Mar. On the right axis: Conversion.',
  )
})

test('a reference label moves out past the right axis’ labels', () => {
  const plain = composedChartModel({ ...input, references: [{ value: 1500, label: 'Target' }] })
  const right = plain.rightAxis
  assert.ok(right)
  const without = composedChartModel({
    ...input,
    series: series.map((entry) => ({ ...entry, axis: 'left' as const })),
    references: [{ value: 1500, label: 'Target' }],
  })
  assert.equal(without.rightAxis, undefined)
  assert.ok(
    plain.plot.width < without.plot.width - right.width + 1,
    'the margin holds both the axis and the label',
  )
})

test('right-axis bars stand on the right axis’ zero', () => {
  const model = composedChartModel({
    ...input,
    series: [series[0] as ComposedSeries, { key: 'rate', label: 'Conversion', axis: 'right' }],
  })
  assert.equal(model.rightAxis?.ticks[0]?.label, '0%', 'bars measure from zero')
  const bars = model.marks.filter((mark) => mark.kind === 'bar' && mark.series === 1)
  const bottom = model.plot.y + model.plot.height
  for (const bar of bars) assert.ok(bar.kind === 'bar' && near(bar.y + bar.height, bottom, 0.5))
})

test('the rendered chart: the right axis drawn, its values formatted in the table', () => {
  const html = renderToStaticMarkup(
    <ComposedChart
      accessibilityLabel="Revenue and conversion"
      data={data}
      x={{ key: 'month', label: 'Month' }}
      y={input.y}
      y2={{ format: pct }}
      series={series}
      width={480}
      height={260}
    />,
  )
  assert.match(html, /<th scope="row">Feb<\/th><td>\$1800<\/td><td>3.4%<\/td>/)
  assert.match(html, />5%<\/text>/)
  assert.match(html, /On the right axis: Conversion\./)
  // Without y2's format a right-axis value is read plainly, not in dollars.
  const plain = renderToStaticMarkup(
    <ComposedChart
      accessibilityLabel="Revenue and conversion"
      data={data}
      x={{ key: 'month' }}
      y={input.y}
      series={series}
      width={480}
      height={260}
    />,
  )
  assert.match(plain, /<td>0.034<\/td>/)
})
