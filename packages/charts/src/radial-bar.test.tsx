import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { datumSentence, nextDatum } from './active.ts'
import { RadialBarChart } from './index.tsx'
import type { Mark } from './model.ts'
import { interpolateModel } from './motion.ts'
import { radialBarChartModel, SWEEP, sweepPath } from './radial-bar.ts'
import { chartSummary } from './summary.ts'

const data = [
  { goal: 'Steps', done: 100 },
  { goal: 'Sleep', done: 50 },
  { goal: 'Water', done: 25 },
]
const series = [{ key: 'done', label: 'Done' }]
const input = {
  data,
  x: { key: 'goal' },
  y: { domain: [0, 100] as const },
  series,
  width: 400,
  height: 300,
}
const near = (a: number, b: number, by = 0.05) => Math.abs(a - b) < by
type Sweep = Extract<Mark, { kind: 'sweep' }>
const sweeps = (marks: Mark[]) => marks.filter((mark): mark is Sweep => mark.kind === 'sweep')

test('a ring per row, the first outermost, each bar as long in angle as its value', () => {
  const model = radialBarChartModel(input)
  const bars = sweeps(model.marks)
  assert.deepEqual(
    bars.map((mark) => mark.datum),
    [0, 1, 2],
  )
  // The domain's top is three quarters of a turn, so 100 sweeps it all.
  assert.ok(near(bars[0]?.end ?? 0, SWEEP))
  assert.ok(near(bars[1]?.end ?? 0, SWEEP / 2))
  assert.ok(near(bars[2]?.end ?? 0, SWEEP / 4))
  for (const bar of bars) assert.equal(bar.start, 0, 'from twelve o’clock')
  const [a, b] = bars as [Sweep, Sweep]
  assert.ok(a.outer > b.outer, 'the first outermost')
  assert.ok(a.inner - b.outer >= 1.9, 'a 2px gap between rings')
  const { inner, outer } = model.radialBar
  assert.ok(near(inner, outer * 0.25), 'a hole in the middle')
})

test('two series share a ring, side by side across it', () => {
  const model = radialBarChartModel({
    ...input,
    data: data.map((row) => ({ ...row, goal2: row.done / 2 })),
    series: [...series, { key: 'goal2', label: 'Half' }],
  })
  const ring = model.radialBar.rings[0]
  const [first, second] = sweeps(model.marks).filter((mark) => mark.datum === 0) as [Sweep, Sweep]
  assert.ok(ring && near(first.outer, ring.outer) && near(second.inner, ring.inner))
  assert.ok(near(first.inner - second.outer, 2))
  assert.equal(model.legend?.length, 2)
})

test('a value of zero or less, or none, has no bar and is still read', () => {
  const model = radialBarChartModel({
    ...input,
    data: [
      { goal: 'A', done: 0 },
      { goal: 'B', done: null },
      { goal: 'C', done: 10 },
    ],
  })
  assert.deepEqual(
    sweeps(model.marks).map((mark) => mark.datum),
    [2],
  )
  assert.equal(datumSentence(model, series, 1), 'B. Done: No value.')
})

test('names end at twelve o’clock level with their rings, and ticks go round the outside', () => {
  const model = radialBarChartModel(input)
  const { labels, ticks, cx, cy, outer, rings } = model.radialBar
  for (const [i, label] of labels.entries()) {
    const ring = rings[i]
    assert.ok(label.x < cx)
    assert.ok(ring && label.y > cy - ring.outer && label.y < cy - ring.inner + 12)
  }
  assert.equal(ticks[0]?.label, '0')
  assert.equal(ticks.at(-1)?.label, '100')
  assert.equal(ticks.at(-1)?.anchor, 'end', 'the last at nine o’clock, left of the circle')
  assert.ok((ticks.at(-1)?.x ?? 0) < cx - outer)
  for (const tick of ticks) assert.ok(tick.x >= 0 && tick.x <= model.width)
})

test('Down and Up step through the rings, and the pointer finds the ring or its name', () => {
  const model = radialBarChartModel(input)
  assert.equal(model.horizontal, true)
  assert.equal(nextDatum('ArrowDown', 0, 3, model.horizontal), 1)
  const { cx, cy, rings } = model.radialBar
  const middle = (i: number) => ((rings[i]?.outer ?? 0) + (rings[i]?.inner ?? 0)) / 2
  assert.equal(model.datumAt(cx + middle(1), cy), 1, 'on the ring at three o’clock')
  assert.equal(model.datumAt(cx - 30, cy - middle(2)), 2, 'level with its name')
  assert.equal(model.datumAt(cx, cy), -1, 'the hole')
  assert.equal(model.datumAt(0, 0), -1)
})

test('read as bars are, outermost first', () => {
  const model = radialBarChartModel(input)
  assert.equal(
    chartSummary(model, series),
    '3 categories, Steps to Water. Done: lowest 25 at Water, highest 100 at Steps.',
  )
})

test('a bar grows along its ring, and its path is a ring segment', () => {
  const from = radialBarChartModel(input)
  const to = radialBarChartModel({ ...input, data: data.map((row) => ({ ...row, done: 100 })) })
  const half = interpolateModel(from, to, 0.5)
  const end = (marks: Mark[]) => sweeps(marks).find((mark) => mark.datum === 1)?.end ?? 0
  assert.ok(near(end(half.marks), (end(from.marks) + end(to.marks)) / 2, 1e-6))
  const path = sweepPath(sweeps(from.marks)[1] as Sweep)
  assert.equal((path.match(/A/g) ?? []).length, 2, 'out along the outer arc and back the inner')
})

test('the rendered chart: the table, a track per ring, a bar per value', () => {
  const html = renderToStaticMarkup(
    <RadialBarChart
      accessibilityLabel="Goals today"
      data={data}
      x={{ key: 'goal', label: 'Goal' }}
      y={{ domain: [0, 100] }}
      series={series}
      width={400}
      height={300}
    />,
  )
  assert.match(html, /<th scope="row">Sleep<\/th><td>50<\/td>/)
  assert.equal((html.match(/<path/g) ?? []).length, 3 + 3, 'three tracks and three bars')
  assert.match(html, />Water<\/text>/)
})
