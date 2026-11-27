import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { Sparkline } from './index.tsx'
import { sparklineModel, sparklineSummary } from './sparkline.tsx'

test('the line spans the box inside its inset, lowest at the bottom, broken at a gap', () => {
  const model = sparklineModel({ values: [1, 3, null, 2], width: 34, height: 14 })
  assert.equal(model.path, 'M2,12L12,2M32,7')
  assert.deepEqual(model.last, { cx: 32, cy: 7 })
  assert.equal(sparklineModel({ values: [5, null], width: 34, height: 14 }).last, undefined)
  assert.deepEqual(sparklineModel({ values: [], width: 34, height: 14 }), { path: '' })
})

test('a flat line sits in the middle, and one value is a dot in the centre', () => {
  assert.equal(sparklineModel({ values: [4, 4], width: 20, height: 10 }).path, 'M2,5L18,5')
  assert.deepEqual(sparklineModel({ values: [4], width: 20, height: 10 }).last, { cx: 10, cy: 5 })
})

test('the summary says where the line starts and ends, and its extremes', () => {
  const dollars = (value: number) => `$${value}`
  assert.equal(
    sparklineSummary([412, 71, 730, 380], dollars),
    '4 values, from $412 to $380; lowest $71, highest $730',
  )
  assert.equal(
    sparklineSummary([null, 2, 1], String),
    '3 values, from No value to 1; lowest 1, highest 2, 1 without a value',
  )
  assert.equal(sparklineSummary([]), 'no values')
})

test('a Sparkline is one named image on Web, not a tab stop and with no table', () => {
  const html = renderToStaticMarkup(
    <Sparkline accessibilityLabel="Visits, last 4 days" values={[412, 71, 730, 380]} />,
  )
  assert.match(
    html,
    /^<svg role="img" aria-label="Visits, last 4 days: 4 values, from 412 to 380; lowest 71, highest 730\." width="96" height="24"/,
  )
  assert.doesNotMatch(html, /tabindex|<table/)
  assert.match(html, /<circle /, 'the last value is marked')
})
