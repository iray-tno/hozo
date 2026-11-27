import assert from 'node:assert/strict'
import { test } from 'node:test'

import { computeSubtreeDelta, createHozoSubtreeStore, IDLE_SUBTREE_STATE } from './subtree-store.ts'

test('HozoSubtreeStore tracks overlapping descendants and notifies only on 0 <-> 1 crossings', () => {
  const store = createHozoSubtreeStore(null)
  let notifications = 0
  const unsub = store.subscribe(() => {
    notifications += 1
  })

  // First child hovered -> flips false -> true (1 notification).
  store.reporter.report({ hovered: 1 })
  assert.equal(notifications, 1)
  assert.equal(store.getSnapshot().hovered, true)

  // Second child hovered while first is still hovered -> count 1 -> 2 (no notification).
  store.reporter.report({ hovered: 1 })
  assert.equal(notifications, 1)
  assert.equal(store.getSnapshot().hovered, true)

  // First child unhovered -> count 2 -> 1 (still hovered, no notification).
  store.reporter.report({ hovered: -1 })
  assert.equal(notifications, 1)
  assert.equal(store.getSnapshot().hovered, true)

  // Second child unhovered -> count 1 -> 0 (flips true -> false, 2nd notification).
  store.reporter.report({ hovered: -1 })
  assert.equal(notifications, 2)
  assert.equal(store.getSnapshot().hovered, false)

  unsub()
})

test('nested HozoSubtreeStores propagate focus upward and computeSubtreeDelta cleans up on unmount', () => {
  const outer = createHozoSubtreeStore(null)
  const inner = createHozoSubtreeStore(outer.reporter)

  const focused = { pressed: false, hovered: false, focused: true, focusVisible: true }
  const enter = computeSubtreeDelta(IDLE_SUBTREE_STATE, focused)
  assert.deepEqual(enter, { pressed: 0, hovered: 0, focused: 1, focusVisible: 1 })
  assert.ok(enter)
  inner.reporter.report(enter)

  assert.equal(inner.getSnapshot().focused, true)
  assert.equal(outer.getSnapshot().focused, true)
  assert.equal(outer.getSnapshot().focusVisible, true)

  // Unmount cleanup restores both inner and outer to idle.
  const leave = computeSubtreeDelta(focused, IDLE_SUBTREE_STATE)
  assert.deepEqual(leave, { pressed: 0, hovered: 0, focused: -1, focusVisible: -1 })
  assert.ok(leave)
  inner.reporter.report(leave)

  assert.equal(inner.getSnapshot().focused, false)
  assert.equal(outer.getSnapshot().focused, false)
  assert.equal(outer.getSnapshot().focusVisible, false)
  assert.equal(computeSubtreeDelta(IDLE_SUBTREE_STATE, IDLE_SUBTREE_STATE), null)
})
