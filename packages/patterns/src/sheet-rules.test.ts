import assert from 'node:assert/strict'
import test from 'node:test'

import {
  clampToDetents,
  cycleDetent,
  fractionAfter,
  nextDetent,
  normalizeDetents,
  PROJECTION_MS,
  projectedFraction,
  restingFraction,
  travelFor,
} from './sheet-rules.ts'

test('detents are sorted, deduplicated and bounded, and a sheet always has one', () => {
  assert.deepEqual(normalizeDetents([1, 0.5, 0.5]), [0.5, 1])
  // Zero is not a position, and neither is anything taller than the sheet.
  assert.deepEqual(normalizeDetents([0, 0.5, 1.5, Number.NaN]), [0.5])
  assert.deepEqual(normalizeDetents([]), [1])
  assert.deepEqual(normalizeDetents(undefined), [1])
})

test('travel and fraction are each other, and a sheet with no height is open', () => {
  assert.equal(travelFor(1, 400), 0)
  assert.equal(travelFor(0.5, 400), 200)
  assert.equal(fractionAfter(200, 400), 0.5)
  assert.equal(fractionAfter(600, 400), 0)
  // Before the first measurement there is nothing to be a fraction of, and the
  // answer has to be "all of it" or the sheet renders itself off the screen.
  assert.equal(fractionAfter(0, 0), 1)
  assert.equal(travelFor(0.5, 0), 0)
})

test('a drag cannot pull the sheet above its largest detent', () => {
  assert.equal(clampToDetents(0.9, [0.5]), 0.5)
  assert.equal(clampToDetents(0.9, [0.5, 1]), 0.9)
  // Downward is unclamped, because that is the dismissal.
  assert.equal(clampToDetents(0.01, [0.5, 1]), 0.01)
})

test('a slow release projects almost nowhere and a flick projects past the sheet', () => {
  const extent = 400
  assert.equal(projectedFraction({ fraction: 0.8, velocity: 0, extent }), 0.8)
  // 0.02 px/ms carries 10px of a 400px sheet: a fortieth.
  assert.equal(
    projectedFraction({ fraction: 1, velocity: 0.02, extent }),
    fractionAfter(0.02 * PROJECTION_MS, extent),
  )
  // A deliberate flick is capped at the sheet's own height, which is "gone".
  assert.equal(projectedFraction({ fraction: 1, velocity: 4, extent }), 0)
  // Upward velocity is negative and opens it again.
  assert.equal(projectedFraction({ fraction: 0.5, velocity: -1, extent }), 1)
})

test('a release lands on the nearest detent, and a flick skips past them', () => {
  const extent = 400
  const detents = [0.5, 1]
  assert.equal(restingFraction({ fraction: 0.9, velocity: 0, extent, detents }), 1)
  assert.equal(restingFraction({ fraction: 0.6, velocity: 0, extent, detents }), 0.5)
  // The point of the projection: let go at full height but moving fast, and it
  // goes away rather than snapping back to where the finger was.
  assert.equal(restingFraction({ fraction: 1, velocity: 2, extent, detents }), null)
  // The same position, released still, keeps the sheet.
  assert.equal(restingFraction({ fraction: 1, velocity: 0, extent, detents }), 1)
})

test('dismissal is null, and its default threshold is half the lowest detent', () => {
  const extent = 400
  // One detent, so the default floor is 0.5.
  assert.equal(restingFraction({ fraction: 0.51, velocity: 0, extent }), 1)
  assert.equal(restingFraction({ fraction: 0.49, velocity: 0, extent }), null)
  // Two detents put the floor at a quarter, so a sheet dragged to a third of
  // itself snaps back to the half rather than going away.
  const detents = [0.5, 1]
  assert.equal(restingFraction({ fraction: 0.33, velocity: 0, extent, detents }), 0.5)
  assert.equal(restingFraction({ fraction: 0.2, velocity: 0, extent, detents }), null)
  // And the caller can say otherwise.
  assert.equal(
    restingFraction({ fraction: 0.33, velocity: 0, extent, detents, dismissBelow: 0.4 }),
    null,
  )
})

test('a tie keeps the content on screen', () => {
  // Exactly between 0.5 and 1, released still: the larger wins, because a
  // person who has not decided can always drag it back down.
  assert.equal(restingFraction({ fraction: 0.75, velocity: 0, extent: 400, detents: [0.5, 1] }), 1)
})

test('the keyboard steps through detents and gives the key back at the ends', () => {
  const detents = [0.4, 0.7, 1]
  assert.equal(nextDetent(0.4, detents, 1), 0.7)
  assert.equal(nextDetent(0.7, detents, 1), 1)
  assert.equal(nextDetent(1, detents, 1), null)
  assert.equal(nextDetent(0.4, detents, -1), null)
  // Mid-drag positions round to the detent they are nearest.
  assert.equal(nextDetent(0.68, detents, 1), 1)
})

test('a press cycles, and there is nothing to cycle with one detent', () => {
  const detents = [0.4, 0.7, 1]
  assert.equal(cycleDetent(0.4, detents), 0.7)
  assert.equal(cycleDetent(1, detents), 0.4)
  // Which is how the component knows the handle is decoration rather than a
  // control: there is no size to change.
  assert.equal(cycleDetent(1, [1]), null)
  assert.equal(cycleDetent(1, undefined), null)
})
