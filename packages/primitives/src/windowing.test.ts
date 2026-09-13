// The windowing arithmetic, asked directly.
//
// `./list.ts` is the part that needs a browser to say anything about;
// this is the part that does not, which is why it was separated out. Every
// number below is checkable by hand against the geometry in the test, and
// none of it depends on a DOM having laid anything out.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  anchorCorrection,
  anchorRow,
  initialRange,
  ListMetrics,
  windowRange,
  withFocus,
} from './windowing.ts'

/** `count` rows of `length` each, all measured. */
function uniform(count: number, length: number, estimate = length): ListMetrics {
  const metrics = new ListMetrics(estimate)
  const keys = Array.from({ length: count }, (_, index) => `k${index}`)
  metrics.setKeys(keys)
  for (const key of keys) metrics.measure(key, length)
  return metrics
}

test('offsets are the running sum of what was measured', () => {
  const metrics = new ListMetrics(50)
  metrics.setKeys(['a', 'b', 'c'])
  metrics.measure('a', 10)
  metrics.measure('b', 20)
  metrics.measure('c', 30)
  assert.equal(metrics.offsetAt(0), 0)
  assert.equal(metrics.offsetAt(1), 10)
  assert.equal(metrics.offsetAt(2), 30)
  assert.equal(metrics.totalLength, 60)
})

test('an unmeasured row is the mean of the measured ones, not the estimate', () => {
  // The estimate is what a caller guessed before anything ran. Once rows
  // have been measured, the guess is the worst available answer: a list of
  // 60px rows told to estimate 200 would keep a scrollbar three times too
  // long, and every `scrollToIndex` past the window would land wrong.
  const metrics = new ListMetrics(200)
  metrics.setKeys(['a', 'b', 'c'])
  assert.equal(metrics.lengthAt(0), 200, 'before any measurement, the estimate stands')

  metrics.measure('a', 60)
  metrics.measure('b', 60)
  assert.equal(metrics.lengthAt(2), 60, 'the unmeasured row follows the measured ones')
  assert.equal(metrics.totalLength, 180)
})

test('a measurement is kept by key, so prepending does not move it', () => {
  // The reason the store is keyed at all. Indexed by position, ten rows
  // prepended to a feed would hand every existing row somebody else's
  // height.
  const metrics = new ListMetrics(50)
  metrics.setKeys(['a', 'b'])
  metrics.measure('a', 10)
  metrics.measure('b', 300)

  metrics.setKeys(['x', 'y', 'a', 'b'])
  assert.equal(metrics.lengthAt(2), 10, 'a moved from index 0 to 2 and kept its height')
  assert.equal(metrics.lengthAt(3), 300)
  assert.equal(metrics.lengthAt(0), 155, 'the new rows take the mean of the measured ones')
})

test('re-reporting the same measurement changes nothing', () => {
  // A `ResizeObserver` fires on mount for every row it observes, so most
  // reports are the size already recorded. Saying so lets the caller skip
  // a render rather than loop through one per row.
  const metrics = new ListMetrics(50)
  metrics.setKeys(['a'])
  assert.equal(metrics.measure('a', 10), true)
  assert.equal(metrics.measure('a', 10), false)
  assert.equal(metrics.measure('a', 11), true)
})

test('the window is the visible rows plus (windowSize - 1) viewports, split half each way', () => {
  // React Native's arithmetic, checked against geometry rather than
  // against itself: 100px rows, a 500px viewport, scrolled to 5000.
  // Visible is rows 50..54. `windowSize: 3` is two extra viewports, one
  // each way: 500px before and 500px after.
  //
  // 44 rather than 45 at the top, and that is the boundary rule rather
  // than an off-by-one: overscan begins at exactly 4500, which is where
  // row 44 ends and row 45 begins, and a row owns its *end* offset. So the
  // row that merely touches the edge is included. Written down because the
  // first version of this test asserted 45 from a description of the rule
  // rather than from the rule.
  const metrics = uniform(200, 100)
  const range = windowRange({
    count: 200,
    offset: 5000,
    visibleLength: 500,
    windowSize: 3,
    maxToRenderPerBatch: 100,
    previous: { first: 44, last: 59 },
    metrics,
  })
  assert.deepEqual(range, { first: 44, last: 59 })
})

test('and it is bounded by the window rather than by the data', () => {
  // The whole point of #385. Ten thousand rows, a 500px viewport, React
  // Native's own default `windowSize` of 21: twenty viewports of overscan
  // is 10,000px, which is 100 rows, plus the 5 visible.
  const metrics = uniform(10_000, 100)
  const previous = { first: 0, last: 9 }
  const range = windowRange({
    count: 10_000,
    offset: 500_000 / 2,
    visibleLength: 500,
    windowSize: 21,
    maxToRenderPerBatch: 10_000,
    previous,
    metrics,
  })
  const mounted = range.last - range.first + 1
  assert.ok(mounted <= 106, `mounted ${mounted} rows of 10,000`)
  assert.ok(mounted >= 100, `mounted only ${mounted} rows, which is less than the window asks for`)
})

test('the window grows a batch at a time rather than filling at once', () => {
  // Twenty viewports of content in one commit is a long pause looking at
  // whatever is already on screen. `maxToRenderPerBatch` is the cap on how
  // much *new* work one pass may schedule, so the first pass after a jump
  // does not mount the whole overscan region.
  const metrics = uniform(1000, 100)
  const previous = { first: 0, last: 9 }
  const range = windowRange({
    count: 1000,
    offset: 0,
    visibleLength: 500,
    windowSize: 21,
    maxToRenderPerBatch: 10,
    previous,
    metrics,
  })
  const added = range.last - previous.last
  assert.ok(added <= 10, `added ${added} rows in one pass with maxToRenderPerBatch 10`)
  assert.ok(range.last >= 4, 'the visible rows are mounted whatever the batch limit says')
})

test('the window settles on every visible row, whatever the batch limit', () => {
  // A property over a spread of scroll positions and batch limits, run to
  // convergence rather than asked of one pass -- which is the honest
  // question, because `maxToRenderPerBatch` is a cap on new work per pass
  // and a small one is *meant* to arrive over several. Asked of a single
  // pass, `maxToRenderPerBatch: 1` at the very bottom of the list trails
  // the last row by one, and that is the batching working.
  //
  // Convergence itself is half the assertion: a window that never settles
  // is a component that re-renders forever.
  const metrics = uniform(500, 80)
  for (const offset of [0, 37, 400, 4000, 12_345, 39_920]) {
    for (const maxToRenderPerBatch of [1, 5, 50]) {
      let range = { first: 0, last: 0 }
      let passes = 0
      for (;;) {
        const next = windowRange({
          count: 500,
          offset,
          visibleLength: 600,
          windowSize: 5,
          maxToRenderPerBatch,
          previous: range,
          metrics,
        })
        passes += 1
        if (next.first === range.first && next.last === range.last) break
        range = next
        assert.ok(passes < 500, `offset ${offset}, batch ${maxToRenderPerBatch}: never settled`)
      }

      const firstVisible = Math.floor(offset / 80)
      const lastVisible = Math.min(499, Math.floor((offset + 600) / 80))
      assert.ok(
        range.first <= firstVisible && range.last >= lastVisible,
        `offset ${offset}, batch ${maxToRenderPerBatch}: ${JSON.stringify(range)} misses ${firstVisible}..${lastVisible}`,
      )
    }
  }
})

test('an empty list has an empty window rather than a first row', () => {
  const range = windowRange({
    count: 0,
    offset: 0,
    visibleLength: 500,
    windowSize: 21,
    maxToRenderPerBatch: 10,
    previous: { first: 0, last: -1 },
    metrics: new ListMetrics(100),
  })
  assert.deepEqual(range, { first: 0, last: -1 })
})

test('a list that shrank under a stationary scroll shows its end', () => {
  // Scroll to row 900 of 1000, then the data becomes 10 rows. The offset
  // is still 90,000 and the whole list is now above the window. Rendering
  // nothing would be a blank page that a scroll event never corrects,
  // because there would be nothing to scroll.
  const metrics = uniform(10, 100)
  const range = windowRange({
    count: 10,
    offset: 90_000,
    visibleLength: 500,
    windowSize: 21,
    maxToRenderPerBatch: 10,
    previous: { first: 895, last: 905 },
    metrics,
  })
  assert.equal(range.last, 9)
  assert.ok(range.first <= 9 && range.first >= 0)
})

test('the first render mounts initialNumToRender, before any viewport is known', () => {
  // Server rendering and the first client commit have no measured
  // viewport, and a window computed from a zero-length one is empty.
  // `initialNumToRender` is the answer to that rather than an overscan
  // setting -- a crawler and `renderToStaticMarkup` both land here.
  assert.deepEqual(initialRange(1000, 10), { first: 0, last: 9 })
  assert.deepEqual(initialRange(3, 10), { first: 0, last: 2 })
  assert.deepEqual(initialRange(0, 10), { first: 0, last: -1 })
  assert.deepEqual(initialRange(1000, 0), { first: 0, last: 0 }, 'never fewer than one row')
})

test('the anchor is the first row the reader can actually see', () => {
  const metrics = uniform(100, 100)
  const keys = Array.from({ length: 100 }, (_, index) => `k${index}`)
  // Scrolled to 550: row 5 spans 500..600, so it is the first one on screen.
  assert.deepEqual(anchorRow(keys, metrics, 550, 0), { key: 'k5', offset: 500 })
})

test('and minIndexForVisible skips the rows that never move', () => {
  // A header pinned at offset 0 is visible from every scroll position and
  // holding it still holds nothing still.
  const metrics = uniform(100, 100)
  const keys = Array.from({ length: 100 }, (_, index) => `k${index}`)
  assert.deepEqual(anchorRow(keys, metrics, 0, 1), { key: 'k1', offset: 100 })
})

test('prepending moves the scroll by exactly what was inserted', () => {
  // The correction `maintainVisibleContentPosition` applies. Ten rows of
  // 100px inserted above the anchor is 1000px of new content, and without
  // this the reader's place jumps ten screens.
  const metrics = new ListMetrics(100)
  const before = Array.from({ length: 20 }, (_, index) => `k${index}`)
  metrics.setKeys(before)
  for (const key of before) metrics.measure(key, 100)

  const anchor = anchorRow(before, metrics, 550, 0)
  assert.ok(anchor)

  const after = [...Array.from({ length: 10 }, (_, index) => `new${index}`), ...before]
  metrics.setKeys(after)
  for (let index = 0; index < 10; index++) metrics.measure(`new${index}`, 100)

  assert.equal(anchorCorrection(anchor, after, metrics), 1000)
})

test('and an anchor that is gone asks for no correction at all', () => {
  // A list replaced wholesale has nothing to hold still, and a correction
  // invented from a row that no longer exists would move a page the reader
  // was looking at.
  const metrics = uniform(20, 100)
  const anchor = { key: 'k5', offset: 500 }
  assert.equal(anchorCorrection(anchor, ['a', 'b', 'c'], metrics), 0)
})

test('the focused row stays mounted however far the scroll moved from it', () => {
  // Focus is not the viewport. Unmounting the row that holds it drops focus
  // to `<body>`, which is not a degraded experience but a lost place.
  const scrolled = { first: 400, last: 500 }
  assert.deepEqual(withFocus(scrolled, 12, 1000), { first: 9, last: 500 })
  assert.deepEqual(withFocus(scrolled, 900, 1000), { first: 400, last: 903 })
})

test('and it keeps rows on both sides of it, so a step past the edge lands', () => {
  // Tabbing forward walks to the last mounted row and then to nothing,
  // because there is nothing after it in the document.
  const window = withFocus({ first: 0, last: 20 }, 20, 1000)
  assert.ok(window.last > 20, `nothing after the focused row: ${JSON.stringify(window)}`)
})

test('a focus window never leaves the list', () => {
  assert.deepEqual(withFocus({ first: 0, last: 4 }, 0, 5), { first: 0, last: 4 })
  assert.deepEqual(withFocus({ first: 0, last: 4 }, 4, 5), { first: 0, last: 4 })
})

test('and no focus, or focus on a row that is gone, changes nothing', () => {
  const window = { first: 10, last: 20 }
  assert.deepEqual(withFocus(window, null, 100), window)
  assert.deepEqual(withFocus(window, 500, 100), window, 'a row index the data no longer has')
  assert.deepEqual(withFocus(window, 5, 0), window, 'an empty list')
})
