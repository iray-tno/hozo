import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nextDatum } from './active.ts'
import { barChartModel } from './model.ts'
import { chartSummary, includesTable, TABLE_ROW_LIMIT } from './summary.ts'

const series = [
  { key: 'online', label: 'Online' },
  { key: 'store', label: 'In store' },
]

test('the summary gives the range and each series’ extremes, gaps counted', () => {
  const model = barChartModel({
    data: [
      { month: 'Jan', online: 120, store: 80 },
      { month: 'Feb', online: 200, store: null },
      { month: 'Mar', online: 90, store: 60 },
    ],
    x: { key: 'month' },
    series,
    width: 320,
    height: 200,
  })
  assert.equal(
    chartSummary(model, series, (value) => `$${value}`),
    '3 categories, Jan to Mar. Online: lowest $90 at Mar, highest $200 at Feb. ' +
      'In store: lowest $60 at Mar, highest $80 at Jan, 1 without a value.',
  )
})

test('a series with no values, one category and no data each read plainly', () => {
  const one = barChartModel({
    data: [{ month: 'Jan', online: 5, store: null }],
    x: { key: 'month' },
    series,
    width: 320,
    height: 200,
  })
  assert.equal(
    chartSummary(one, series),
    '1 category, Jan. Online: lowest 5 at Jan, highest 5 at Jan. In store: no values.',
  )
  const none = barChartModel({ data: [], x: { key: 'month' }, series, width: 320, height: 200 })
  assert.equal(chartSummary(none, series), 'No data.')
})

test('past the row limit the table is left out unless shown, and the summary says so', () => {
  assert.equal(includesTable(TABLE_ROW_LIMIT, false), true)
  assert.equal(includesTable(TABLE_ROW_LIMIT + 1, false), false)
  assert.equal(includesTable(TABLE_ROW_LIMIT + 1, true), true)
  const data = Array.from({ length: 1500 }, (_, i) => ({ x: `d${i}`, v: i }))
  const model = barChartModel({
    data,
    x: { key: 'x' },
    series: [{ key: 'v', label: 'V' }],
    width: 800,
    height: 200,
  })
  assert.equal(
    chartSummary(model, [{ key: 'v', label: 'V' }], String, true),
    '1,500 categories, d0 to d1499. V: lowest 0 at d0, highest 1499 at d1499. ' +
      'Too many to list as a table; step through them on the chart.',
  )
})

test('Page Up and Page Down move a tenth of the data', () => {
  assert.equal(nextDatum('PageDown', undefined, 100), 9)
  assert.equal(nextDatum('PageDown', 95, 100), 99)
  assert.equal(nextDatum('PageUp', 50, 100), 40)
  assert.equal(nextDatum('PageUp', undefined, 100), 90)
  assert.equal(nextDatum('PageDown', 0, 3), 1, 'at least one step')
})
