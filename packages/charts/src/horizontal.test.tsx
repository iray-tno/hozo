import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { nextDatum, tooltipBox } from './active.ts'
import { BarChart } from './index.tsx'
import { barChartModel, type Mark } from './model.ts'

const data = [
  { team: 'Customer support', open: 42, closed: 30 },
  { team: 'Billing', open: 12, closed: null },
  { team: 'Platform', open: 27, closed: 18 },
]
const base = {
  data,
  x: { key: 'team' },
  series: [
    { key: 'open', label: 'Open' },
    { key: 'closed', label: 'Closed' },
  ],
  width: 400,
  height: 180,
  horizontal: true,
}
const bars = (marks: Mark[]) =>
  marks.filter((mark): mark is Extract<Mark, { kind: 'bar' }> => mark.kind === 'bar')

test('horizontal bars run from zero along x, one band of rows per category', () => {
  const model = barChartModel(base)
  assert.equal(model.horizontal, true)
  assert.deepEqual(
    model.yTicks.map((tick) => tick.label),
    ['Customer support', 'Billing', 'Platform'],
    'the categories are on the left, top to bottom',
  )
  assert.equal(model.xTicks[0]?.label, '0', 'the values are along the bottom')
  const marks = bars(model.marks)
  assert.equal(marks.length, 5, 'no bar for the missing Billing value')
  for (const mark of marks) assert.ok(Math.abs(mark.x - model.plot.x) < 0.01, 'each starts at zero')
  const support = marks.find((mark) => mark.series === 0 && mark.datum === 0)
  const billing = marks.find((mark) => mark.series === 0 && mark.datum === 1)
  assert.ok(support && billing && support.width > billing.width * 3, '42 is longer than 12')
  assert.ok(billing.y > support.y, 'rows go down in data order')
  assert.ok(
    model.plot.x > 'Customer support'.length * 6,
    'the left margin fits the longest category',
  )
})

test('stacked horizontal bars sit end to end', () => {
  const model = barChartModel({ ...base, stacked: true })
  const [open, closed] = bars(model.marks).filter((mark) => mark.datum === 0)
  assert.ok(open && closed)
  assert.ok(Math.abs(closed.x - (open.x + open.width)) < 0.01)
  assert.equal(closed.y, open.y, 'one row, not grouped')
})

test('the pointer is matched by y, and Down and Up step through the rows', () => {
  const model = barChartModel(base)
  assert.equal(model.datumAt(model.plot.x + 300, model.centers[2]), 2)
  assert.equal(model.datumAt(0, model.centers[0]), 0, 'x does not matter')
  assert.equal(nextDatum('ArrowDown', 0, 3, true), 1)
  assert.equal(nextDatum('ArrowUp', 1, 3, true), 0)
  assert.equal(nextDatum('ArrowDown', 0, 3), undefined, 'upright charts leave Down to the page')
  assert.equal(nextDatum('ArrowRight', 0, 3, true), 1)
})

test('the tooltip sits below the row, inside the chart', () => {
  const model = barChartModel(base)
  const rows = [{ label: 'Open', value: '42', color: '#000' }]
  const box = tooltipBox(model, 'Customer support', rows, 12, 0)
  assert.ok(box.y > (model.centers[0] as number))
  assert.ok(box.x + box.width <= model.width)
  const last = tooltipBox(model, 'Platform', rows, 12, 2)
  assert.ok(last.y + last.height <= model.height, 'flips above the last row')
})

test('the Web markup draws vertical gridlines and the categories as left labels', () => {
  const html = renderToStaticMarkup(<BarChart accessibilityLabel="Tickets by team" {...base} />)
  assert.match(html, />Customer support<\/text>/)
  assert.equal([...html.matchAll(/<rect [^>]*fill="#/g)].length, 5)
  assert.match(html, /<table/)
})
