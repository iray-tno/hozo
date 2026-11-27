import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { datumSentence } from './active.ts'
import { DEFAULT_PALETTE, DonutChart, PieChart } from './index.tsx'
import { arcPath, paletteTones, pieChartModel, shareFormat } from './pie.ts'

const data = [
  { channel: 'Online', revenue: 200 },
  { channel: 'In store', revenue: 100 },
  { channel: 'Returns', revenue: -20 },
  { channel: 'Phone', revenue: null },
  { channel: 'Partners', revenue: 100 },
]
const input = {
  data,
  x: { key: 'channel' },
  value: { key: 'revenue', label: 'Revenue' },
  width: 400,
  height: 200,
}

test('a slice per positive value, clockwise from twelve, sized by its share', () => {
  const model = pieChartModel(input)
  const arcs = model.marks.filter((mark) => mark.kind === 'arc')
  assert.deepEqual(
    arcs.map((mark) => mark.datum),
    [0, 1, 4],
    'no slice for a negative or missing value',
  )
  assert.equal(model.radial.total, 400)
  const { cx, cy, outer } = model.radial
  // Online is half: from twelve o'clock to six, so its arc ends straight below.
  assert.match(
    arcs[0]?.path ?? '',
    new RegExp(`^M${cx},${cy - outer}A.* 0 0 1 ${cx},${cy + outer}L`),
  )
  assert.deepEqual(
    model.values,
    [[200, 100, -20, undefined, 100]],
    'the table still lists a negative',
  )
  assert.deepEqual(model.xTicks, [])
})

test('the legend sits beside the circle when there is room, and under it when not', () => {
  const wide = pieChartModel(input).radial
  assert.ok(wide.legend[0] && wide.legend[0].x > wide.cx + wide.outer, 'beside')
  const narrow = pieChartModel({ ...input, width: 200, height: 400 }).radial
  assert.ok(narrow.legend[0] && narrow.legend[0].y > narrow.cy + narrow.outer, 'under')
})

test('a point finds the slice by its angle, the legend by its row, and the hole finds nothing', () => {
  const model = pieChartModel({ ...input, innerRadius: 0.5 })
  const { cx, cy, outer, legend } = model.radial
  const ring = outer * 0.75
  assert.equal(model.datumAt(cx + ring, cy), 0, 'three o’clock is inside Online')
  assert.equal(model.datumAt(cx - ring * 0.7, cy + ring * 0.7), 1, 'seven-thirty is In store')
  assert.equal(model.datumAt(cx - ring, cy - 1), 4, 'just before twelve is Partners')
  assert.equal(model.datumAt(cx, cy), -1, 'the hole')
  const row = legend[2]
  assert.ok(row)
  assert.equal(
    model.datumAt(row.x + 2, row.y + 4),
    4,
    'a legend row: Partners, the third with a slice',
  )
})

test('a single slice is a whole circle, and a donut cuts its hole', () => {
  const whole = arcPath(50, 50, 40, 0, 0, Math.PI * 2)
  assert.equal(whole.split('A').length - 1, 2, 'two half arcs')
  const ring = arcPath(50, 50, 40, 20, 0, Math.PI * 2)
  assert.equal(ring.split('A').length - 1, 4, 'and two more for the hole')
  const slice = arcPath(50, 50, 40, 20, 0, Math.PI / 2)
  assert.match(slice, /^M50,10A40,40 0 0 1 90,50L70,50A20,20 0 0 0 50,30Z$/)
})

test('values read as shares of the positive whole', () => {
  const format = shareFormat(data, 'revenue', (value) => `$${value}`)
  assert.equal(format(200), '$200 (50%)')
  assert.equal(format(-20), '$-20', 'no share for what has no slice')
  const model = pieChartModel(input)
  assert.equal(
    datumSentence(model, [{ key: 'revenue', label: 'Revenue' }], 1, format),
    'In store. Revenue: $100 (25%).',
  )
})

test('PieChart and DonutChart draw slices in palette order, with a table of shares', () => {
  const pie = renderToStaticMarkup(<PieChart accessibilityLabel="Revenue by channel" {...input} />)
  const fills = [...pie.matchAll(/<path [^>]*fill="(#[0-9a-f]+)"/g)].map((match) => match[1])
  assert.deepEqual(
    fills,
    [DEFAULT_PALETTE[0], DEFAULT_PALETTE[1], DEFAULT_PALETTE[2]],
    'by slice, not by row',
  )
  assert.match(pie, /<td[^>]*>200 \(50%\)<\/td>/)
  assert.match(pie, />Partners<\/text>/, 'the legend names every row')
  assert.doesNotMatch(pie, /<line/, 'no axes')
  const donut = renderToStaticMarkup(
    <DonutChart accessibilityLabel="Revenue by channel" {...input} colors={['#111111']} />,
  )
  assert.match(
    donut,
    /<path [^>]*d="M[^"]*A[^"]*A[^"]*"[^>]*fill="#111111"/,
    'outer and inner arcs',
  )
})

test('a seventh slice does not take the colour of the first, which it touches', () => {
  assert.deepEqual(paletteTones(3), [0, 1, 2])
  assert.deepEqual(paletteTones(7), [0, 1, 2, 3, 4, 5, 1])
  assert.deepEqual(paletteTones(8), [0, 1, 2, 3, 4, 5, 0, 1])
  assert.deepEqual(paletteTones(13).slice(-2), [5, 1])
})
