import assert from 'node:assert/strict'
import test from 'node:test'

import {
  clampedSize,
  FALLBACK_LINE_HEIGHT,
  heightForRows,
  remainingCharacters,
  shouldAnnounceCount,
  usableLineHeight,
} from './text-area-rules.ts'

test('a line height is taken, derived, or assumed, in that order', () => {
  assert.equal(usableLineHeight(24, 16), 24)
  // `normal` and React Native's absent `lineHeight` both arrive as not-a-number.
  assert.equal(usableLineHeight(Number.NaN, 16), 19)
  assert.equal(usableLineHeight(undefined, 20), 24)
  assert.equal(usableLineHeight(undefined, undefined), FALLBACK_LINE_HEIGHT)
  // Nothing useful is a number that cannot be a height.
  assert.equal(usableLineHeight(0, 0), FALLBACK_LINE_HEIGHT)
})

test('a height is rows times a line, plus what is not text', () => {
  assert.equal(heightForRows(3, 20), 60)
  assert.equal(heightForRows(3, 20, 18), 78)
  assert.equal(heightForRows(-1, 20, 18), 18)
})

test('an empty field is as tall as its minimum, not as tall as its text', () => {
  const size = clampedSize({ content: 20, lineHeight: 20, extra: 18, minRows: 3 })
  assert.deepEqual(size, { height: 78, scrollable: false })
})

test('a field grows past its minimum and stops at its cap', () => {
  const box = { lineHeight: 20, extra: 18, minRows: 2, maxRows: 4 }
  assert.deepEqual(clampedSize({ ...box, content: 60 }), { height: 78, scrollable: false })
  assert.deepEqual(clampedSize({ ...box, content: 80 }), { height: 98, scrollable: false })
  // Five lines of text in a four-line box: capped, and now it scrolls.
  assert.deepEqual(clampedSize({ ...box, content: 100 }), { height: 98, scrollable: true })
})

test('a pixel over the cap is rounding rather than a fifth line', () => {
  const box = { lineHeight: 20, extra: 0, maxRows: 4 }
  assert.equal(clampedSize({ ...box, content: 81 }).scrollable, false)
  assert.equal(clampedSize({ ...box, content: 82 }).scrollable, true)
})

test('a cap below the floor loses to the floor', () => {
  // A field shorter than its own minimum is the one of the two that cannot be
  // rendered, so the contradiction resolves upward.
  const size = clampedSize({ content: 20, lineHeight: 20, minRows: 4, maxRows: 2 })
  assert.equal(size.height, 80)
})

test('an uncapped field never reports itself as scrolling', () => {
  const size = clampedSize({ content: 4000, lineHeight: 20, minRows: 2 })
  assert.deepEqual(size, { height: 4000, scrollable: false })
})

test('the remaining count is characters, not code units', () => {
  assert.equal(remainingCharacters('hello', 10), 5)
  assert.equal(remainingCharacters('hello', undefined), null)
  // Past the limit is zero rather than a negative, because "-3 characters left"
  // is not a sentence a reader should hear.
  assert.equal(remainingCharacters('hello', 3), 0)
  // One emoji is two code units and one character. `.length` would say 8 left.
  assert.equal(remainingCharacters('🙂', 10), 9)
})

test('a count is announced twice at most, and never on arrival', () => {
  const threshold = 10
  // Nothing to compare against on the first render; a field that announced its
  // own mount would speak over whatever opened it.
  assert.equal(shouldAnnounceCount({ previous: null, remaining: 3, threshold }), false)
  // Crossing into the warning band, once.
  assert.equal(shouldAnnounceCount({ previous: 11, remaining: 10, threshold }), true)
  assert.equal(shouldAnnounceCount({ previous: 10, remaining: 9, threshold }), false)
  // Running out, once.
  assert.equal(shouldAnnounceCount({ previous: 1, remaining: 0, threshold }), true)
  assert.equal(shouldAnnounceCount({ previous: 0, remaining: 0, threshold }), false)
  // Nothing is counted when nothing is limited.
  assert.equal(shouldAnnounceCount({ previous: 5, remaining: null, threshold }), false)
})

test('deleting back out of the limit re-arms the warning', () => {
  // Somebody who has deleted their way out and typed back in is in the situation
  // the warning is for again.
  assert.equal(shouldAnnounceCount({ previous: 0, remaining: 4 }), false)
  assert.equal(shouldAnnounceCount({ previous: 20, remaining: 4 }), true)
})
