import assert from 'node:assert/strict'
import { test } from 'node:test'
import { datumRows, datumSentence, nextDatum, tooltipBox } from './active.ts'
import { barChartModel } from './model.ts'

const series = [
  { key: 'online', label: 'Online' },
  { key: 'store', label: 'In store', color: '#123456' },
]
const model = barChartModel({
  data: [
    { month: 'Jan', online: 120, store: 80 },
    { month: 'Feb', online: 200, store: null },
    { month: 'Mar', online: 90, store: 60 },
  ],
  x: { key: 'month' },
  series,
  width: 300,
  height: 200,
})

test('arrow keys, Home and End move the active datum and stop at the ends', () => {
  assert.equal(nextDatum('ArrowRight', undefined, 3), 0, 'the first press starts at the start')
  assert.equal(nextDatum('ArrowLeft', undefined, 3), 2, 'or from the end going back')
  assert.equal(nextDatum('ArrowRight', 1, 3), 2)
  assert.equal(nextDatum('ArrowRight', 2, 3), 2, 'no wrap past the last')
  assert.equal(nextDatum('ArrowLeft', 0, 3), 0)
  assert.equal(nextDatum('Home', 2, 3), 0)
  assert.equal(nextDatum('End', 0, 3), 2)
  assert.equal(nextDatum('Enter', 0, 3), undefined, 'other keys are left to the page')
  assert.equal(nextDatum('ArrowRight', undefined, 0), undefined, 'nothing to move to')
})

test('a datum reads as one sentence with every series, a gap as no value', () => {
  assert.equal(datumSentence(model, series, 0), 'Jan. Online: 120. In store: 80.')
  assert.equal(
    datumSentence(model, series, 1, (value) => `$${value}`),
    'Feb. Online: $200. In store: No value.',
  )
  assert.deepEqual(
    datumRows(model, series, 0).map((row) => row.color),
    ['#2563eb', '#123456'],
  )
})

test('the tooltip sits beside its datum, on the side with room, inside the chart', () => {
  for (let datum = 0; datum < 3; datum++) {
    const rows = datumRows(model, series, datum)
    const box = tooltipBox(model, model.categories[datum] as string, rows, 12, datum)
    assert.ok(box.x >= 0 && box.x + box.width <= model.width, `datum ${datum} fits across`)
    assert.ok(box.y >= 0 && box.y + box.height <= model.height, `datum ${datum} fits down`)
    const center = model.centers[datum] as number
    assert.ok(box.x > center || box.x + box.width < center, `datum ${datum} is not covered`)
  }
})
