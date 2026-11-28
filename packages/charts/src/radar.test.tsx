import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { datumSentence, nextDatum } from './active.ts'
import { RadarChart } from './index.tsx'
import { interpolateModel } from './motion.ts'
import { radarChartModel, radarPath } from './radar.ts'
import { chartSummary } from './summary.ts'

const data = [
  { skill: 'Speed', a: 80, b: 40 },
  { skill: 'Power', a: 60, b: 90 },
  { skill: 'Range', a: 40, b: 70 },
  { skill: 'Control', a: 100, b: 50 },
]
const series = [
  { key: 'a', label: 'Model A' },
  { key: 'b', label: 'Model B' },
]
const input = { data, x: { key: 'skill' }, series, width: 400, height: 300 }
const near = (a: number, b: number, by = 0.05) => Math.abs(a - b) < by

test('a spoke per row, clockwise from twelve o’clock, each value its distance out', () => {
  const model = radarChartModel(input)
  const { cx, cy, radius, spokes } = model.radar
  assert.ok(near(spokes[0]?.x ?? 0, cx) && near(spokes[0]?.y ?? 0, cy - radius), 'first at the top')
  assert.ok(near(spokes[1]?.x ?? 0, cx + radius) && near(spokes[1]?.y ?? 0, cy), 'second at three')
  assert.ok(near(spokes[2]?.y ?? 0, cy + radius), 'third at six')
  const points = model.marks.filter((mark) => mark.kind === 'point' && mark.series === 0)
  // The domain is 0 to 100, so Control's 100 reaches the end of its spoke
  // and Speed's 80 is four fifths of the way up.
  const at = (datum: number) => points.find((mark) => 'datum' in mark && mark.datum === datum)
  const control = at(3)
  assert.ok(control?.kind === 'point' && near(control.cx, cx - radius))
  const speed = at(0)
  assert.ok(speed?.kind === 'point' && near(cy - speed.cy, radius * 0.8))
})

test('a fill under each outline, then the outlines and dots over every fill', () => {
  const model = radarChartModel(input)
  assert.deepEqual(
    model.marks.slice(0, 3).map((mark) => mark.kind),
    ['area', 'area', 'line'],
  )
  const line = model.marks.find((mark) => mark.kind === 'line')
  assert.ok(line?.kind === 'line' && line.path.endsWith('Z'), 'closed')
  assert.equal(model.legend?.length, 2, 'a key for two series')
})

test('rings at the ticks, labelled beside the top spoke, and each name outside its spoke', () => {
  const model = radarChartModel(input)
  const { rings, labels, cx, radius, cy } = model.radar
  assert.ok(rings.length >= 2)
  assert.equal(rings.at(-1)?.label, '100')
  assert.ok(near(rings.at(-1)?.y ?? 0, cy - radius))
  assert.deepEqual(
    labels.map((label) => label.anchor),
    ['middle', 'start', 'middle', 'end'],
  )
  assert.ok((labels[0]?.y ?? 0) < cy - radius, 'above the top')
  assert.ok((labels[1]?.x ?? 0) > cx + radius, 'right of three')
  // Every name inside the chart's width.
  for (const label of labels) assert.ok(label.x >= 0 && label.x <= model.width)
})

test('a gap breaks the outline, which then has no fill, and never crosses it', () => {
  assert.equal(
    radarPath([
      [0, 0],
      [1, 1],
      [2, 2],
    ]),
    'M0,0L1,1L2,2Z',
  )
  assert.equal(radarPath([[0, 0], undefined, [2, 2], [3, 3]]), 'M2,2L3,3L0,0', 'wraps past the top')
  const model = radarChartModel({
    ...input,
    data: data.map((row, i) => (i === 1 ? { ...row, a: null } : row)),
  })
  const areas = model.marks.filter((mark) => mark.kind === 'area')
  assert.deepEqual(
    areas.map((mark) => mark.series),
    [1],
  )
})

test('the keys go round in data order and the pointer finds the nearest spoke', () => {
  assert.equal(nextDatum('ArrowRight', 3, 4), 3, 'stops at the last, as the table does')
  const model = radarChartModel(input)
  const { cx, cy } = model.radar
  assert.equal(model.datumAt(cx + 5, cy - 100), 0)
  assert.equal(model.datumAt(cx + 100, cy + 5), 1)
  assert.equal(model.datumAt(cx - 100, cy - 10), 3)
  assert.equal(model.datumAt(cx, cy), -1, 'the centre is no spoke')
})

test('read as a line chart is: each spoke with every series, and each series’ extremes', () => {
  const model = radarChartModel(input)
  assert.equal(datumSentence(model, series, 1), 'Power. Model A: 60. Model B: 90.')
  assert.equal(
    chartSummary(model, series),
    '4 categories, Speed to Control. Model A: lowest 40 at Range, highest 100 at Control. ' +
      'Model B: lowest 40 at Speed, highest 90 at Power.',
  )
})

test('an outline moves to its new values', () => {
  const from = radarChartModel(input)
  const to = radarChartModel({ ...input, data: data.map((row) => ({ ...row, a: row.a / 2 })) })
  const half = interpolateModel(from, to, 0.5)
  const point = (model: ReturnType<typeof interpolateModel>) =>
    model.marks.find((mark) => mark.kind === 'point' && mark.datum === 0)
  const [a, b, c] = [point(from), point(to), point(half)]
  assert.ok(a?.kind === 'point' && b?.kind === 'point' && c?.kind === 'point')
  assert.ok(near(c.cy, (a.cy + b.cy) / 2, 0.01))
})

test('the rendered chart: a table of every series, the rings and the names', () => {
  const html = renderToStaticMarkup(
    <RadarChart
      accessibilityLabel="Two models compared"
      data={data}
      x={{ key: 'skill', label: 'Skill' }}
      series={series}
      width={400}
      height={300}
      points
    />,
  )
  assert.match(html, /<th scope="row">Control<\/th><td>100<\/td><td>50<\/td>/)
  assert.match(html, />Speed<\/text>/)
  assert.equal((html.match(/<circle/g) ?? []).length, 8, 'a dot per value')
  assert.equal(chartSummary(radarChartModel({ ...input, data: [] }), series), 'No data.', 'no rows')
})
