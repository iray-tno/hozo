import assert from 'node:assert/strict'
import test from 'node:test'
import { durationValue, seekTime, VideoObserver } from './status.ts'
import { validateVideoProps } from './types.ts'

test('snapshots cannot mutate observations, callbacks can change, and a retired source is silent', () => {
  const events: string[] = []
  let callbacks = { onPlay: () => events.push('old') }
  const observer = new VideoObserver('a.mp4', () => callbacks)
  callbacks = { onPlay: () => events.push('new') }
  observer.update({ status: 'ready', duration: 4 })
  const snapshot = observer.snapshot()
  snapshot.status = 'error'
  assert.equal(observer.snapshot().status, 'ready')
  observer.update({ playing: true })
  observer.update({ playing: true })
  assert.deepEqual(events, ['new'])
  observer.fail('play', new Error('blocked'))
  const error = observer.snapshot().error
  if (error) error.message = 'modified'
  assert.equal(observer.snapshot().error?.message, 'blocked')
  observer.dispose()
  observer.update({ playing: false })
  observer.ended()
  observer.fail('load', 'late error')
  assert.equal(observer.snapshot().playing, true)
})

test('end is emitted once; request denial is not a fatal source error', () => {
  const events: string[] = []
  const observer = new VideoObserver('a.mp4', () => ({
    onPause: () => events.push('pause'),
    onEnded: () => events.push('ended'),
    onError: ({ operation }) => events.push(operation),
  }))
  observer.update({ status: 'ready', playing: true })
  observer.fail('play', 'denied')
  assert.equal(observer.snapshot().status, 'ready')
  observer.ended()
  observer.ended()
  assert.deepEqual(events, ['play', 'pause', 'ended'])
  observer.fail('load', 'bad source')
  assert.equal(observer.snapshot().status, 'error')
})

test('unknown duration stays unknown; seeking rejects invalid or unready requests', () => {
  for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(durationValue(value), null)
  }
  assert.equal(durationValue(4), 4)
  const observer = new VideoObserver('a.mp4', () => ({}))
  assert.throws(() => seekTime(0, observer.snapshot()), /not ready/)
  observer.update({ status: 'ready', duration: 4 })
  assert.equal(seekTime(8, observer.snapshot()), 4)
  assert.equal(seekTime(0, observer.snapshot()), 0)
  for (const seconds of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => seekTime(seconds, observer.snapshot()), RangeError)
  }
  assert.throws(() => validateVideoProps({ src: '', accessibilityLabel: 'Clip' }), /src/)
  assert.throws(() => validateVideoProps({ src: 'a.mp4', accessibilityLabel: ' ' }), /Label/)
})
