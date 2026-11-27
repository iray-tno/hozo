import assert from 'node:assert/strict'
import { test } from 'node:test'
import { areaChartModel, areaPath, type Mark } from './model.ts'

const data = [
  { month: 'Jan', online: 120, store: 80 },
  { month: 'Feb', online: 200, store: null },
  { month: 'Mar', online: 90, store: 60 },
  { month: 'Apr', online: 160, store: 110 },
]
const base = {
  data,
  x: { key: 'month' },
  series: [
    { key: 'online', label: 'Online' },
    { key: 'store', label: 'In store' },
  ],
  width: 400,
  height: 240,
  margin: { top: 10, right: 10, bottom: 30, left: 40 },
}
const of = <K extends Mark['kind']>(marks: Mark[], kind: K, series: number) =>
  marks.find((mark) => mark.kind === kind && mark.series === series) as Extract<Mark, { kind: K }>

test('an area closes along its tops and back along its bottoms, one run per unbroken stretch', () => {
  assert.equal(
    areaPath([[0, 1, 9], [10, 2, 9], undefined, [30, 3, 9], [40, 4, 9]]),
    'M0,1L10,2L10,9L0,9ZM30,3L40,4L40,9L30,9Z',
  )
  assert.equal(areaPath([[0, 1, 9], undefined, [20, 2, 9]]), '', 'a lone value has no width')
})

test('unstacked bands run down to zero, translucent, under the lines', () => {
  const model = areaChartModel(base)
  assert.equal(Number(model.yTicks[0]?.label), 0, 'zero is in the domain')
  const kinds = model.marks.map((mark) => mark.kind)
  assert.ok(kinds.lastIndexOf('area') < kinds.indexOf('line'), 'every fill is drawn first')
  const online = of(model.marks, 'area', 0)
  assert.equal(online.opacity, 0.25)
  const zero = model.yTicks[0]?.position as number
  assert.ok(online.path.endsWith(`,${zero}Z`), 'back along the baseline')
  const store = of(model.marks, 'area', 1)
  assert.equal(
    store.path.split('M').length - 1,
    1,
    'lone January draws nothing; March to April does',
  )
  assert.ok(store.path.startsWith(`M${model.centers[2]},`), 'the band starts after the gap')
})

test('stacked, each line is the running total and the table keeps each value', () => {
  const full = data.map((row, i) => ({ ...row, store: row.store ?? 40 + i }))
  const model = areaChartModel({ ...base, data: full, stacked: true })
  assert.deepEqual(model.values[1], [80, 41, 60, 110], 'the values are not summed')
  const first = model.yTicks[0] as { position: number; label: string }
  const last = model.yTicks.at(-1) as { position: number; label: string }
  const y = (value: number) =>
    first.position +
    ((value - Number(first.label)) / (Number(last.label) - Number(first.label))) *
      (last.position - first.position)
  const jan = model.marks.find(
    (mark) => mark.kind === 'point' && mark.series === 1 && mark.datum === 0,
  )
  assert.ok(jan?.kind === 'point')
  assert.ok(Math.abs(jan.cy - y(200)) < 0.01, 'In store sits on Online: 120 + 80')
  assert.ok(Number(last.label) >= 270, 'the axis reaches the largest total')
  const store = of(model.marks, 'area', 1)
  assert.equal(store.opacity, 0.7)
  assert.ok(
    store.path.includes(`L${model.centers[0]},${Math.round(y(120) * 100) / 100}Z`),
    'its bottom is Online',
  )
})
