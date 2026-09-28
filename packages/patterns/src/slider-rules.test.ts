import assert from 'node:assert/strict'
import test from 'node:test'

import { fractionAt, fractionOf, movedBy, snap, valueAt } from './slider-rules.ts'

const zeroToTen = { min: 0, max: 10, step: 1 }

test('snapping goes to the nearest step and stays inside the range', () => {
  assert.equal(snap(3.4, zeroToTen), 3)
  assert.equal(snap(3.6, zeroToTen), 4)
  assert.equal(snap(-5, zeroToTen), 0)
  assert.equal(snap(99, zeroToTen), 10)
})

test('steps are counted from min, not from zero', () => {
  // A range of 1 to 10 in threes has 1, 4, 7, 10 on it. Snapping from zero
  // would offer 3, 6 and 9 -- none of which the caller said were values.
  const range = { min: 1, max: 10, step: 3 }
  assert.equal(snap(2, range), 1)
  assert.equal(snap(3, range), 4)
  assert.equal(snap(6, range), 7)
})

test('the top of the range is reachable even when the step does not divide it', () => {
  // A slider whose right-hand end cannot be reached is a bug people report.
  // The cost is a last step shorter than the others, which nobody notices.
  const range = { min: 0, max: 10, step: 3 }
  assert.equal(snap(9.6, range), 10)
  assert.equal(snap(10, range), 10)
  assert.equal(valueAt(1, range), 10)
})

test('a fractional step does not produce a number a reader has to say', () => {
  // `0.1 + 0.2` is `0.30000000000000004`, and `aria-valuenow` would carry it.
  const range = { min: 0, max: 1, step: 0.1 }
  assert.equal(snap(0.30000000000000004, range), 0.3)
  assert.equal(snap(0.7000000000000001, range), 0.7)
  for (let at = 0; at <= 10; at++) {
    const value = snap(at / 10, range)
    assert.equal(String(value).length <= 3, true, `${value} is longer than the step implies`)
  }
})

test('a fraction and a value are the same thing from either end', () => {
  for (const value of [0, 1, 5, 9, 10]) {
    assert.equal(valueAt(fractionOf(value, zeroToTen), zeroToTen), value)
  }
  assert.equal(fractionOf(5, zeroToTen), 0.5)
  assert.equal(valueAt(0.5, zeroToTen), 5)
})

test('a range with no width has a fraction rather than a division by zero', () => {
  assert.equal(fractionOf(4, { min: 4, max: 4, step: 1 }), 0)
})

test('the arrows move by a step and the pages by ten of them', () => {
  const at = (value: number) => ({ ...zeroToTen, value })
  assert.equal(movedBy('ArrowUp', at(5)), 6)
  assert.equal(movedBy('ArrowDown', at(5)), 4)
  assert.equal(movedBy('ArrowRight', at(5)), 6)
  assert.equal(movedBy('ArrowLeft', at(5)), 4)
  assert.equal(movedBy('PageUp', at(5)), 10, 'ten steps, clamped to max')
  assert.equal(movedBy('PageDown', at(5)), 0)
  assert.equal(movedBy('Home', at(5)), 0)
  assert.equal(movedBy('End', at(5)), 10)
})

test('only the two horizontal arrows mirror in a right-to-left track', () => {
  const at = { ...zeroToTen, value: 5, rtl: true }
  assert.equal(movedBy('ArrowRight', at), 4, 'the right-hand end is the low end')
  assert.equal(movedBy('ArrowLeft', at), 6)
  // Up is more everywhere: a vertical scale is not mirrored by writing
  // direction, and Home and End are the ends of the scale rather than of the
  // screen.
  assert.equal(movedBy('ArrowUp', at), 6)
  assert.equal(movedBy('ArrowDown', at), 4)
  assert.equal(movedBy('Home', at), 0)
  assert.equal(movedBy('End', at), 10)
})

test('a key the slider does not answer is null, not the value unchanged', () => {
  // The caller uses this to decide whether to call `preventDefault`. A slider
  // that swallowed a key without moving would trap one the page wanted.
  assert.equal(movedBy('Enter', { ...zeroToTen, value: 5 }), null)
  assert.equal(movedBy('a', { ...zeroToTen, value: 5 }), null)
  assert.equal(movedBy('ArrowUp', { ...zeroToTen, value: 10 }), 10, 'but the top is not null')
})

test('a pointer on a horizontal track is measured from its left edge', () => {
  const box = { left: 100, top: 0, width: 200, height: 20 }
  assert.equal(fractionAt({ x: 100, y: 10 }, box), 0)
  assert.equal(fractionAt({ x: 200, y: 10 }, box), 0.5)
  assert.equal(fractionAt({ x: 300, y: 10 }, box), 1)
  assert.equal(fractionAt({ x: 900, y: 10 }, box), 1, 'past the end is the end')
  assert.equal(fractionAt({ x: -50, y: 10 }, box), 0)
})

test('a vertical track is measured from its bottom, because up is more', () => {
  const box = { left: 0, top: 50, width: 20, height: 100 }
  assert.equal(fractionAt({ x: 10, y: 150 }, box, { vertical: true }), 0, 'the bottom is min')
  assert.equal(fractionAt({ x: 10, y: 100 }, box, { vertical: true }), 0.5)
  assert.equal(fractionAt({ x: 10, y: 50 }, box, { vertical: true }), 1, 'the top is max')
})

test('a right-to-left track puts min on the right', () => {
  const box = { left: 0, top: 0, width: 100, height: 20 }
  assert.equal(fractionAt({ x: 100, y: 10 }, box, { rtl: true }), 0)
  assert.equal(fractionAt({ x: 0, y: 10 }, box, { rtl: true }), 1)
})

test('a track with no size does not divide by zero', () => {
  assert.equal(fractionAt({ x: 5, y: 5 }, { left: 0, top: 0, width: 0, height: 0 }), 0)
  assert.equal(
    fractionAt({ x: 5, y: 5 }, { left: 0, top: 0, width: 0, height: 0 }, { vertical: true }),
    0,
  )
})
