import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { brushModel, clampRange, dragTo, grabAt, moveEnd, rangeNote } from './brush.ts'
import { BarChart, LineChart } from './index.tsx'

const days = Array.from({ length: 30 }, (_, i) => ({
  day: `Day ${i + 1}`,
  visits: i === 10 ? null : 100 + i * 10,
}))

test('a range is clamped to the data, in order, and the whole by default', () => {
  assert.deepEqual(clampRange(undefined, 30), { start: 0, end: 29 })
  assert.deepEqual(clampRange({ start: -5, end: 99 }, 30), { start: 0, end: 29 })
  assert.deepEqual(clampRange({ start: 20, end: 5 }, 30), { start: 5, end: 20 })
  assert.deepEqual(clampRange({ start: 2.6 }, 30), { start: 3, end: 29 })
  assert.deepEqual(clampRange(undefined, 0), { start: 0, end: 0 })
})

test('keys move one end a row, a tenth or all the way, and never past the other', () => {
  const range = { start: 5, end: 10 }
  assert.deepEqual(moveEnd('ArrowRight', range, 'start', 30), { start: 6, end: 10 })
  assert.deepEqual(moveEnd('ArrowLeft', range, 'end', 30), { start: 5, end: 9 })
  assert.deepEqual(moveEnd('PageUp', range, 'end', 30), { start: 5, end: 13 })
  assert.deepEqual(moveEnd('Home', range, 'start', 30), { start: 0, end: 10 })
  assert.deepEqual(moveEnd('End', range, 'end', 30), { start: 5, end: 29 })
  // The start stops at the end: a range of one row, never none.
  assert.deepEqual(moveEnd('End', range, 'start', 30), { start: 10, end: 10 })
  assert.deepEqual(moveEnd('Home', range, 'end', 30), { start: 5, end: 5 })
  assert.equal(moveEnd('Enter', range, 'start', 30), undefined)
})

test('the strip has a cell per row, the overview breaks at a gap, and the range spans its cells', () => {
  const values = days.map((row) => row.visits ?? undefined)
  const model = brushModel(values, { start: 5, end: 9 }, 300, 40)
  assert.equal(model.cell, 10)
  assert.equal(model.x0, 50)
  assert.equal(model.x1, 100)
  assert.equal(model.overview.match(/M/g)?.length, 2, 'one run before the gap, one after')
  assert.match(model.overview, /^M5,36L15,/, 'the first value is lowest, at the bottom inset')
  assert.equal(model.indexAt(-10), 0)
  assert.equal(model.indexAt(55), 5)
  assert.equal(model.indexAt(999), 29)
})

test('a press takes the nearer end, the range when inside it, and drags it', () => {
  const values = days.map((row) => row.visits ?? undefined)
  const range = { start: 5, end: 14 }
  const model = brushModel(values, range, 300, 40)
  assert.deepEqual(grabAt(model, range, 52), { kind: 'start' })
  assert.deepEqual(grabAt(model, range, 148), { kind: 'end' })
  assert.deepEqual(grabAt(model, range, 95), { kind: 'window', offset: 4 })
  assert.deepEqual(grabAt(model, range, 10), { kind: 'start' }, 'outside: the nearer end')
  assert.deepEqual(dragTo(model, range, { kind: 'start' }, 25, 30), { start: 2, end: 14 })
  assert.deepEqual(dragTo(model, range, { kind: 'start' }, 290, 30), { start: 14, end: 14 })
  assert.deepEqual(dragTo(model, range, { kind: 'end' }, 0, 30), { start: 5, end: 5 })
  // The range keeps its length, and stops at either edge of the data.
  assert.deepEqual(dragTo(model, range, { kind: 'window', offset: 4 }, 205, 30), {
    start: 16,
    end: 25,
  })
  assert.deepEqual(dragTo(model, range, { kind: 'window', offset: 4 }, 299, 30), {
    start: 20,
    end: 29,
  })
  assert.deepEqual(dragTo(model, range, { kind: 'window', offset: 4 }, 0, 30), {
    start: 0,
    end: 9,
  })
})

test('the note says how many rows are shown, and nothing when all are', () => {
  assert.equal(rangeNote({ start: 5, end: 14 }, 30), 'Showing 10 of 30 categories.')
  assert.equal(rangeNote({ start: 0, end: 29 }, 30), '')
  assert.equal(rangeNote({ start: 0, end: 0 }, 1200), 'Showing 1 of 1,200 categories.')
})

test('a brushed chart shows its range, says so, names its table with it, and has two sliders', () => {
  const html = renderToStaticMarkup(
    <LineChart
      accessibilityLabel="Visits by day"
      data={days}
      x={{ key: 'day', label: 'Day' }}
      series={[{ key: 'visits', label: 'Visits' }]}
      height={200}
      width={400}
      brush={{ defaultRange: { start: 20, end: 24 } }}
    />,
  )
  assert.match(html, /Showing 5 of 30 categories\. 5 categories, Day 21 to Day 25\./)
  assert.match(html, /<table aria-label="Visits by day, Day 21 to Day 25"/)
  assert.doesNotMatch(html, /<th[^>]*>Day 20<\/th>/)
  assert.match(html, /<th[^>]*>Day 25<\/th>/)
  assert.match(html, /<div role="group" aria-label="Visits by day, range shown"/)
  const sliders = [...html.matchAll(/<div role="slider"[^>]*>/g)].map((m) => m[0])
  assert.equal(sliders.length, 2)
  assert.match(
    sliders[0] ?? '',
    /aria-label="First shown" aria-valuemin="0" aria-valuemax="24" aria-valuenow="20" aria-valuetext="Day 21"/,
  )
  assert.match(
    sliders[1] ?? '',
    /aria-label="Last shown" aria-valuemin="20" aria-valuemax="29" aria-valuenow="24" aria-valuetext="Day 25"/,
  )
  assert.match(html, /:focus-visible\{outline:2px solid currentColor/)
})

test('a controlled range wins over the default, and a chart without brush is unchanged', () => {
  const props = {
    accessibilityLabel: 'Visits',
    data: days,
    x: { key: 'day' },
    series: [{ key: 'visits', label: 'Visits' }],
    height: 200,
    width: 400,
  }
  const controlled = renderToStaticMarkup(
    <BarChart
      {...props}
      brush={{ range: { start: 0, end: 1 }, defaultRange: { start: 9, end: 9 } }}
    />,
  )
  assert.match(controlled, /Showing 2 of 30 categories\. 2 categories, Day 1 to Day 2\./)
  const whole = renderToStaticMarkup(<BarChart {...props} brush />)
  assert.match(whole, /<p[^>]*>30 categories, Day 1 to Day 30\./, 'all shown: no note')
  assert.match(whole, /<table aria-label="Visits"/)
  const plain = renderToStaticMarkup(<BarChart {...props} />)
  assert.doesNotMatch(plain, /role="slider"/)
  assert.equal(plain, renderToStaticMarkup(<BarChart {...props} brush={false} />))
})
