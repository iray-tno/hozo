import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildPeerSnapshot, createHozoPeerStore, IDLE_PEER_STATE } from './peer-store.ts'

test('HozoPeerStore notifies only subscribers watching the changed peer ID', () => {
  const store = createHozoPeerStore()
  let peer0Calls = 0
  let peer1Calls = 0

  const unsub0 = store.subscribe([0], () => {
    peer0Calls += 1
  })
  const unsub1 = store.subscribe([1], () => {
    peer1Calls += 1
  })

  // Publishing idle state is a no-op.
  store.publish(0, IDLE_PEER_STATE)
  assert.equal(peer0Calls, 0)
  assert.equal(peer1Calls, 0)

  // Hovering peer 0 notifies only peer 0's subscriber.
  store.publish(0, { pressed: false, hovered: true, focused: false, focusVisible: false })
  assert.equal(peer0Calls, 1)
  assert.equal(peer1Calls, 0)
  assert.equal(store.get(0).hovered, true)
  assert.equal(store.get(1).hovered, false)

  // Publishing the identical state does not double-notify.
  store.publish(0, { pressed: false, hovered: true, focused: false, focusVisible: false })
  assert.equal(peer0Calls, 1)

  // Clearing peer 0 on unmount resets to idle and notifies.
  store.clear(0)
  assert.equal(peer0Calls, 2)
  assert.equal(store.get(0).hovered, false)

  unsub0()
  unsub1()
})

test('buildPeerSnapshot preserves object identity while watched states are unchanged', () => {
  const store = createHozoPeerStore()
  const snap1 = buildPeerSnapshot(store, [0, 1], null)
  const snap2 = buildPeerSnapshot(store, [0, 1], snap1)
  assert.equal(snap1, snap2)

  // Unwatched peer 2 changing does not invalidate [0, 1]'s snapshot.
  store.publish(2, { pressed: true, hovered: false, focused: false, focusVisible: false })
  const snap3 = buildPeerSnapshot(store, [0, 1], snap2)
  assert.equal(snap3, snap2)

  // Watched peer 1 changing produces a fresh snapshot.
  store.publish(1, { pressed: false, hovered: false, focused: true, focusVisible: true })
  const snap4 = buildPeerSnapshot(store, [0, 1], snap3)
  assert.notEqual(snap4, snap3)
  assert.equal(snap4[0]?.focused, false)
  assert.equal(snap4[1]?.focused, true)
  assert.equal(snap4[1]?.focusVisible, true)
})
