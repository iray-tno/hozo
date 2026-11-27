import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { datumSentence, nextDatum } from './active.ts'
import { ScatterChart } from './index.tsx'
import { scatterChartModel } from './scatter.ts'
import { chartSummary } from './summary.ts'

const products = [
  { product: 'Cobalt', price: 30, rating: 4.1 },
  { product: 'Amber', price: 12, rating: 3.6 },
  { product: 'Birch', price: null, rating: 4.8 },
  { product: 'Dune', price: 45, rating: null },
  { product: 'Ember', price: 12, rating: 4.4 },
]
const dollars = (value: number) => `$${value}`
const base = {
  data: products,
  x: { key: 'price', label: 'Price', format: dollars },
  name: { key: 'product', label: 'Product' },
  series: [{ key: 'rating', label: 'Rating' }],
  width: 400,
  height: 240,
}

test('points are in x order, ties in data order, and a row without x is left out', () => {
  const model = scatterChartModel(base)
  assert.deepEqual(model.categories, ['Amber', 'Ember', 'Cobalt', 'Dune'])
  assert.deepEqual(model.values, [[3.6, 4.4, 4.1, undefined]])
  assert.deepEqual(model.xColumn, {
    label: 'Price',
    values: ['$12', '$12', '$30', '$45'],
    missing: 1,
    inTable: true,
  })
  const points = model.marks.filter((mark) => mark.kind === 'point')
  assert.equal(points.length, 3, 'Dune has no rating, so no dot')
  assert.ok(points.every((mark, i, all) => i === 0 || mark.cx >= (all[i - 1]?.cx ?? 0)))
})

test('the pointer finds the nearest dot in both directions', () => {
  const model = scatterChartModel(base)
  const [amber, ember] = model.marks.filter((mark) => mark.kind === 'point')
  assert.ok(amber?.kind === 'point' && ember?.kind === 'point')
  assert.equal(amber.cx, ember.cx, 'same price')
  assert.equal(model.datumAt(amber.cx, amber.cy + 1), 0)
  assert.equal(model.datumAt(ember.cx, ember.cy - 1), 1, 'told apart by y')
  assert.equal(nextDatum('ArrowRight', 0, model.categories.length), 1, 'keys step in x order')
})

test('a point is read with its name and x value, and the summary gives the x range', () => {
  const model = scatterChartModel(base)
  assert.equal(datumSentence(model, base.series, 2), 'Cobalt, Price: $30. Rating: 4.1.')
  assert.equal(
    chartSummary(model, base.series),
    '4 points, Price from $12 to $45. Rating: lowest 3.6 at Amber, highest 4.4 at Ember, ' +
      '1 without a value. 1 row without Price left out.',
  )
  const unnamed = scatterChartModel({ ...base, name: undefined })
  assert.equal(datumSentence(unnamed, base.series, 0), 'Price: $12. Rating: 3.6.')
  assert.equal(unnamed.xColumn?.inTable, false)
})

test('the Web markup draws a dot per value and a table with the x column after the name', () => {
  const html = renderToStaticMarkup(
    <ScatterChart accessibilityLabel="Price against rating" {...base} />,
  )
  assert.equal([...html.matchAll(/<circle/g)].length, 3)
  const headers = [...html.matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map((match) => match[1])
  assert.deepEqual(headers.slice(0, 3), ['Product', 'Price', 'Rating'])
  assert.match(html, /<td[^>]*>\$30<\/td>/)
  const plain = renderToStaticMarkup(
    <ScatterChart accessibilityLabel="Price against rating" {...base} name={undefined} />,
  )
  const plainHeaders = [...plain.matchAll(/<th[^>]*scope="col"[^>]*>([^<]*)<\/th>/g)].map(
    (match) => match[1],
  )
  assert.deepEqual(plainHeaders, ['Price', 'Rating'], 'no repeated x column')
})
