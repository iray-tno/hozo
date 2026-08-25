import assert from 'node:assert/strict'
import { test } from 'node:test'

import { nextIndex, tabStops } from './roving.ts'

test('the arrows move within the group', () => {
  assert.equal(nextIndex('ArrowRight', { count: 3, active: 0 }), 1)
  assert.equal(nextIndex('ArrowLeft', { count: 3, active: 1 }), 0)
})

test('a key the widget does not take is left for the page', () => {
  // `null` is not an error. A horizontal tab strip that swallowed ArrowUp
  // would take a key away from the page's own scrolling, and a widget that
  // preventDefaults everything is a trap.
  assert.equal(nextIndex('ArrowUp', { count: 3, active: 1 }), null)
  assert.equal(nextIndex('ArrowDown', { count: 3, active: 1 }), null)
  assert.equal(nextIndex('ArrowLeft', { count: 3, active: 1, orientation: 'vertical' }), null)
  // `both` is the two-dimensional case -- a grid, a toolbar that wraps.
  assert.equal(nextIndex('ArrowUp', { count: 3, active: 1, orientation: 'both' }), 0)
})

test('the ends join up, unless told not to', () => {
  assert.equal(nextIndex('ArrowRight', { count: 3, active: 2 }), 0)
  assert.equal(nextIndex('ArrowLeft', { count: 3, active: 0 }), 2)
  // Without wrapping the key is still ours -- it just does nothing, which
  // is different from handing it back to the page.
  assert.equal(nextIndex('ArrowRight', { count: 3, active: 2, wrap: false }), 2)
})

test('left and right are about the screen, not the sequence', () => {
  // The first tab is on the right in Arabic and Hebrew, so Right means
  // previous. Invisible to everyone who builds it, wrong for everyone who
  // reads that way.
  assert.equal(nextIndex('ArrowRight', { count: 3, active: 1, rtl: true }), 0)
  assert.equal(nextIndex('ArrowLeft', { count: 3, active: 1, rtl: true }), 2)
  // Up and down are not: vertical order does not flip with direction.
  assert.equal(nextIndex('ArrowDown', { count: 3, active: 1, orientation: 'vertical', rtl: true }), 2)
})

test('a disabled item is passed over rather than landed on', () => {
  // It is still in the group -- announced, holding its place -- but
  // arrowing onto it would strand someone on something that cannot act.
  assert.equal(nextIndex('ArrowRight', { count: 4, active: 0, disabled: [1, 2] }), 3)
  assert.equal(nextIndex('ArrowLeft', { count: 4, active: 3, disabled: [1, 2] }), 0)
  // Including across the wrap.
  assert.equal(nextIndex('ArrowRight', { count: 3, active: 1, disabled: [2] }), 0)
})

test('Home and End mean the first and last reachable item', () => {
  assert.equal(nextIndex('Home', { count: 4, active: 3 }), 0)
  assert.equal(nextIndex('End', { count: 4, active: 0 }), 3)
  // Not index 0 and index n-1: a disabled first tab is common and landing
  // on it is the same dead end as arrowing onto one.
  assert.equal(nextIndex('Home', { count: 4, active: 3, disabled: [0] }), 1)
  assert.equal(nextIndex('End', { count: 4, active: 0, disabled: [3] }), 2)
  // Absolute, so orientation and direction do not enter into it.
  assert.equal(nextIndex('Home', { count: 3, active: 2, orientation: 'vertical', rtl: true }), 0)
})

test('a group with nothing reachable stays where it is', () => {
  // Every action unavailable is a real state for a toolbar, and the loop
  // that skips disabled items has to stop somewhere.
  assert.equal(nextIndex('ArrowRight', { count: 3, active: 1, disabled: [0, 1, 2] }), 1)
  assert.equal(nextIndex('ArrowRight', { count: 0, active: 0 }), null)
})

test('the group is one tab stop', () => {
  // The half that is easy to leave out, and the whole point: without it
  // the arrow keys are decoration on a tab order twenty presses long.
  assert.deepEqual(tabStops({ count: 3, active: 1 }), [-1, 0, -1])
})

test('the tab stop moves off an item that cannot hold it', () => {
  // A selected tab becoming unavailable is ordinary, and a group whose
  // only tab stop cannot be focused cannot be entered from the keyboard
  // at all.
  assert.deepEqual(tabStops({ count: 3, active: 0, disabled: [0] }), [-1, 0, -1])
})
