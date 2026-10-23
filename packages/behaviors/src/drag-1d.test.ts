import assert from 'node:assert/strict'
import test from 'node:test'
import { createDrag1DSession, type Drag1DOptions } from './drag-1d-session.ts'

test('moves coalesce to a frame; release flushes the final movement exactly once', () => {
  const frames = new Map<number, () => void>()
  const moves: number[] = []
  const ends: number[] = []
  let serial = 0
  const session = createDrag1DSession(
    () => ({ axis: 'x', onMove: (n) => moves.push(n), onEnd: (n) => ends.push(n) }),
    (callback) => {
      frames.set(++serial, callback)
      return serial
    },
    (id) => {
      frames.delete(id)
    },
  )
  assert.equal(session.start(), true)
  assert.equal(session.start(), false)
  session.move(3)
  session.move(17)
  assert.equal(frames.size, 1)
  frames.values().next().value!()
  assert.deepEqual(moves, [17])
  session.move(22)
  session.end(28)
  session.end(40)
  assert.deepEqual(moves, [17, 28])
  assert.deepEqual(ends, [28])
  assert.equal(frames.size, 0)
})

test('cancellation, lost capture and disabling discard pending moves without a commit', () => {
  let callback: (() => void) | undefined
  const values: unknown[] = []
  const options: Drag1DOptions = {
    axis: 'x',
    onMove: (n) => values.push(n),
    onEnd: () => values.push('end'),
    onCancel: () => values.push('cancel'),
  }
  const session = createDrag1DSession(
    () => options,
    (next) => {
      callback = next
      return 1
    },
    () => {
      callback = undefined
    },
  )
  session.start()
  session.move(8)
  session.cancel()
  session.cancel()
  assert.equal(callback, undefined)
  assert.deepEqual(values, ['cancel'])
  session.start()
  options.disabled = true
  session.end(20)
  assert.deepEqual(values, ['cancel', 'cancel'])
  assert.equal(session.start(), false)
})
