import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { ComposedChart, LineChart } from './index.tsx'
import { BAR_MAX, barChartModel, barPath, lineChartModel } from './model.ts'

const data = [
  { month: 'Jan', online: 120, store: 80 },
  { month: 'Feb', online: -40, store: 60 },
]
const two = [
  { key: 'online', label: 'Online' },
  { key: 'store', label: 'In store' },
]
const base = { data, x: { key: 'month' }, series: two, width: 600, height: 240 }

test('a key names each of two or more series above the plot, and none for one', () => {
  const model = barChartModel(base)
  assert.deepEqual(
    model.legend?.map((key) => key.label),
    ['Online', 'In store'],
  )
  const [first, second] = model.legend ?? []
  assert.ok(first && second && second.x > first.x && second.y === first.y, 'one row')
  assert.ok(model.plot.y > (first?.y ?? 0) + 12, 'the plot starts below the key')
  const one = barChartModel({ ...base, series: two.slice(0, 1) })
  assert.deepEqual(one.legend, [])
  assert.ok(one.plot.y < model.plot.y, 'no key, no room for one')
  assert.deepEqual(barChartModel({ ...base, legend: false }).legend, [])
  const narrow = barChartModel({ ...base, width: 120 })
  assert.ok((narrow.legend?.[1]?.y ?? 0) > 0, 'a key too wide for one row wraps')
})

test('the key shows each series by its mark: a block for bars, a stroke for a line', () => {
  const html = renderToStaticMarkup(
    <ComposedChart
      accessibilityLabel="Revenue"
      {...base}
      series={[two[0] as (typeof two)[0], { key: 'store', label: 'In store', type: 'line' }]}
    />,
  )
  assert.match(html, /<rect [^>]*rx="2"/, 'a block for the bars')
  assert.match(html, /<line [^>]*stroke-width="2" stroke-linecap="round"/, 'a stroke for the line')
  const line = renderToStaticMarkup(<LineChart accessibilityLabel="Revenue" {...base} />)
  assert.doesNotMatch(line, /rx="2"/, 'a line chart has no blocks')
})

test('bars are capped in thickness and round only their value end', () => {
  const model = barChartModel({ ...base, series: two.slice(0, 1) })
  const [jan, feb] = model.marks.filter((mark) => mark.kind === 'bar')
  assert.ok(jan?.kind === 'bar' && feb?.kind === 'bar')
  assert.equal(jan.width, BAR_MAX, 'a wide band leaves air rather than a slab')
  const centre = jan.x + jan.width / 2
  assert.ok(Math.abs(centre - (model.centers[0] as number)) < 1e-9, 'centred on its band')
  assert.equal(jan.end, 'top')
  assert.equal(feb.end, 'bottom', 'a negative bar rounds the end that hangs down')
  assert.equal(
    barPath(0, 0, 20, 30, 'top'),
    'M0,30L0,4A4,4 0 0 1 4,0L16,0A4,4 0 0 1 20,4L20,30Z',
    'square at the base, arcs into the top corners',
  )
  assert.match(barPath(0, 0, 20, 2, 'top'), /A1,1 /, 'the radius shrinks for a short bar')
})

test('horizontal stacks open a gap without moving the total', () => {
  const model = barChartModel({ ...base, horizontal: true, stacked: true })
  const row = model.marks.filter((mark) => mark.kind === 'bar' && mark.datum === 0)
  const last = row.at(-1)
  assert.ok(last?.kind === 'bar')
  const total = model.xTicks.find((tick) => tick.label === '200')
  assert.ok(total)
  assert.ok(Math.abs(last.x + last.width - total.position) < 1e-9, 'the stack still ends at 200')
  assert.equal(lineChartModel(base).marks.filter((mark) => mark.kind === 'bar').length, 0)
})
