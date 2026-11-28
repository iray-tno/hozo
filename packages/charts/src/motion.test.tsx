import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { BarChart } from './index.tsx'
import { barChartModel, lineChartModel, type Mark } from './model.ts'
import { ease, interpolateModel, lerpPath } from './motion.ts'
import { pieChartModel } from './pie.ts'

const input = {
  x: { key: 'month' },
  series: [{ key: 'v', label: 'Visits' }],
  width: 600,
  height: 240,
  y: { domain: [0, 100] as const },
}
const before = [
  { month: 'Jan', v: 20 },
  { month: 'Feb', v: 40 },
]
const after = [
  { month: 'Jan', v: 60 },
  { month: 'Feb', v: 40 },
  { month: 'Mar', v: 80 },
]
const bars = (marks: Mark[]) => marks.flatMap((mark) => (mark.kind === 'bar' ? [mark] : []))

test('easing starts and ends still, and passes the middle at half', () => {
  assert.equal(ease(0), 0)
  assert.equal(ease(0.5), 0.5)
  assert.equal(ease(1), 1)
  assert.ok(ease(0.1) < 0.1 && ease(0.9) > 0.9)
})

test('a path blends number by number, and one of another shape is drawn at once', () => {
  assert.equal(lerpPath('M0,0L10,10', 'M10,20L30,10', 0.5), 'M5,10L20,10')
  assert.equal(lerpPath('M0,0L10,10', 'M0,0L10,10M20,5', 0.5), 'M0,0L10,10M20,5')
})

test('bars move from where they were, and a new bar grows from the baseline', () => {
  const from = barChartModel({ ...input, data: before })
  const to = barChartModel({ ...input, data: after })
  const half = bars(interpolateModel(from, to, 0.5).marks)
  const [jan0, jan1, janHalf] = [bars(from.marks)[0], bars(to.marks)[0], half[0]]
  assert.ok(jan0 && jan1 && janHalf)
  assert.ok(Math.abs(janHalf.height - (jan0.height + jan1.height) / 2) < 1e-9)
  const mar = bars(to.marks)[2]
  const growing = half[2]
  assert.ok(mar && growing)
  assert.ok(Math.abs(growing.height - mar.height / 2) < 1e-9, 'half grown')
  assert.ok(
    Math.abs(growing.y + growing.height - (mar.y + mar.height)) < 1e-9,
    'its base stays on the baseline',
  )
  assert.equal(interpolateModel(from, to, 1), to)
  assert.deepEqual(interpolateModel(from, to, 0.5).xTicks, to.xTicks, 'the axes move at once')
})

test('a line blends when its shape holds, and pie slices change at once', () => {
  const line = (data: typeof before) => lineChartModel({ ...input, data })
  const from = line(before)
  const to = line([
    { month: 'Jan', v: 60 },
    { month: 'Feb', v: 0 },
  ])
  const path = (marks: Mark[]) => marks.find((mark) => mark.kind === 'line')
  const mid = path(interpolateModel(from, to, 0.5).marks)
  assert.ok(mid?.kind === 'line')
  assert.notEqual(mid.path, (path(from.marks) as { path: string }).path)
  assert.notEqual(mid.path, (path(to.marks) as { path: string }).path)
  const pie = (data: typeof before) =>
    pieChartModel({
      data,
      x: { key: 'month' },
      value: { key: 'v', label: 'Visits' },
      width: 300,
      height: 300,
    })
  const slices = pie(after)
  assert.deepEqual(interpolateModel(pie(before), slices, 0.5).marks, slices.marks)
})

test('the first drawing is the data itself, with nothing in motion', () => {
  const html = renderToStaticMarkup(
    <BarChart accessibilityLabel="Visits" {...input} data={after} />,
  )
  const still = renderToStaticMarkup(
    <BarChart accessibilityLabel="Visits" {...input} data={after} animate={false} />,
  )
  assert.equal(html, still)
})
