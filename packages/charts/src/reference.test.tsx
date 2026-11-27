import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { BarChart, LineChart } from './index.tsx'
import { barChartModel, lineChartModel } from './model.ts'
import { chartSummary } from './summary.ts'

const data = [
  { month: 'Jan', online: 120 },
  { month: 'Feb', online: 200 },
  { month: 'Mar', online: 90 },
]
const series = [{ key: 'online', label: 'Online' }]
const base = { data, x: { key: 'month' }, series, width: 400, height: 240 }
const dollars = (value: number) => `$${value}`

test('the domain widens to a reference above the data, and the line is placed on it', () => {
  const plain = barChartModel(base)
  const model = barChartModel({ ...base, references: [{ value: 300, label: 'Target' }] })
  assert.ok(Number(plain.yTicks.at(-1)?.label) < 300)
  assert.ok(Number(model.yTicks.at(-1)?.label) >= 300, 'the target is on the chart')
  const [target] = model.references
  const tick = model.yTicks.find((entry) => entry.label === '300')
  assert.ok(target && tick)
  assert.equal(target.start, tick.position)
  assert.equal(target.end, undefined)
  assert.ok(
    model.width - (model.plot.x + model.plot.width) >
      plain.width - (plain.plot.x + plain.plot.width),
    'the right margin makes room for the label, outside the bars',
  )
  const lying = barChartModel({ ...base, horizontal: true })
  const lyingWithTarget = barChartModel({
    ...base,
    horizontal: true,
    references: [{ value: 150, label: 'Target' }],
  })
  assert.ok(lyingWithTarget.plot.y > lying.plot.y, 'horizontal bars put the label above')
})

test('a band has both edges, and horizontal bars place it along x', () => {
  const model = lineChartModel({
    ...base,
    references: [{ value: 100, to: 150, label: 'Normal' }],
  })
  const [band] = model.references
  assert.ok(band?.end !== undefined && band.end < band.start, '150 is above 100')
  const lying = barChartModel({
    ...base,
    horizontal: true,
    references: [{ value: 150, label: 'Target' }],
  })
  const [line] = lying.references
  assert.ok(line && line.start > lying.plot.x && line.start < lying.plot.x + lying.plot.width)
})

test('the summary reads each reference after the series', () => {
  const model = barChartModel({
    ...base,
    references: [
      { value: 150, label: 'Target' },
      { value: 80, to: 110, label: 'Last year' },
    ],
  })
  assert.equal(
    chartSummary(model, series, dollars),
    '3 categories, Jan to Mar. Online: lowest $90 at Mar, highest $200 at Feb. ' +
      'Target: $150. Last year: $80 to $110.',
  )
})

test('the Web markup draws a dashed line over the bars and a band under them', () => {
  const html = renderToStaticMarkup(
    <BarChart
      accessibilityLabel="Revenue"
      {...base}
      references={[
        { value: 150, label: 'Target' },
        { value: 80, to: 110, label: 'Last year' },
      ]}
    />,
  )
  const dashed = html.indexOf('stroke-dasharray="5 4"')
  const firstBar = html.indexOf('fill="#')
  const band = html.indexOf('fill-opacity="0.06"')
  assert.ok(dashed > firstBar, 'the target line comes after the bars')
  assert.ok(band > 0 && band < firstBar, 'the band comes before them')
  assert.match(html, />Target<\/text>/)
  assert.match(html, /Target: 150\./, 'and the description says so')
  const line = renderToStaticMarkup(<LineChart accessibilityLabel="Revenue" {...base} />)
  assert.doesNotMatch(line, /stroke-dasharray/, 'nothing without references')
})
