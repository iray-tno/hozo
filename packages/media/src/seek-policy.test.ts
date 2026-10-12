import assert from 'node:assert/strict'
import test from 'node:test'
import { videoControlState } from './control-state.ts'
import { constrainSeek, domSeekability, seekBounds, stepSeekTarget } from './seek-policy.ts'
import { seekTime, VideoObserver } from './status.ts'
import type { MediaSeekability, MediaStatus } from './types.ts'

const available: MediaSeekability = {
  status: 'available',
  origin: 'engine',
  ranges: [
    { start: 2, end: 4 },
    { start: 6, end: 9 },
  ],
}
const status = (patch: Partial<MediaStatus> = {}): MediaStatus => ({
  src: 'clip',
  status: 'ready',
  playing: false,
  buffering: false,
  currentTime: 3,
  duration: 10,
  error: null,
  seekability: available,
  ...patch,
})

test('only actual seekable ranges establish current availability; failed reads remain unknown', () => {
  const element = (ranges: number[][]) =>
    ({
      duration: 100,
      buffered: { length: 1, start: () => 0, end: () => 100 },
      seekable: {
        length: ranges.length,
        start: (index: number) => ranges[index]?.[0] ?? NaN,
        end: (index: number) => ranges[index]?.[1] ?? NaN,
      },
    }) as unknown as HTMLMediaElement
  assert.deepEqual(domSeekability(element([])), {
    status: 'unavailable',
    origin: 'engine',
    reason: 'empty-ranges',
  })
  assert.deepEqual(
    domSeekability(
      element([
        [2, 4],
        [6, 9],
      ]),
    ),
    available,
  )
  assert.deepEqual(domSeekability({} as HTMLMediaElement), {
    status: 'unknown',
    reason: 'not-exposed',
  })
  for (const ranges of [[[0, Infinity]], [[-1, 4]], [[4, 4]], [[4, 3]], [[0, NaN]]])
    assert.deepEqual(domSeekability(element(ranges)), { status: 'unknown', reason: 'not-observed' })
  assert.deepEqual(
    domSeekability({
      get seekable() {
        throw new Error('unreadable')
      },
    } as unknown as HTMLMediaElement),
    {
      status: 'unknown',
      reason: 'not-observed',
    },
  )
})

test('commands, previews and direction steps share bounded discontinuous timeline policy', () => {
  const observed = status()
  assert.deepEqual(seekBounds(observed), { min: 2, max: 9, duration: 10 })
  for (const [requested, expected] of [
    [0, 2],
    [3, 3],
    [5, 4],
    [5.5, 6],
    [100, 9],
  ] as const) {
    assert.equal(constrainSeek(requested, observed), expected)
    assert.equal(seekTime(requested, observed), expected)
  }
  assert.equal(stepSeekTarget(status({ currentTime: 4 }), 1), 6)
  assert.equal(stepSeekTarget(status({ currentTime: 6 }), -1), 4)
  assert.equal(stepSeekTarget(status({ currentTime: 2 }), -10), null)
  assert.equal(stepSeekTarget(status({ currentTime: 9 }), 10), null)
  assert.equal(videoControlState(status({ currentTime: 2 })).backwardDisabled, true)
  assert.equal(videoControlState(status({ currentTime: 9 })).forwardDisabled, true)
  assert.deepEqual(seekBounds(status({ duration: 7 })), { min: 2, max: 7, duration: 7 })
})

test('an empty observation disables seeking/replay but never disables ready play or active pause', () => {
  const observed = status({
    seekability: { status: 'unavailable', origin: 'engine', reason: 'empty-ranges' },
  })
  assert.equal(seekBounds(observed), null)
  assert.throws(() => seekTime(3, observed), /no observed seekable range/)
  assert.deepEqual(videoControlState(observed), {
    playing: false,
    toggleDisabled: false,
    backwardDisabled: true,
    forwardDisabled: true,
  })
  assert.equal(videoControlState({ ...observed, status: 'ended' }).toggleDisabled, true)
  assert.equal(
    videoControlState({ ...observed, status: 'ended', playing: true }).toggleDisabled,
    false,
  )
})

test('unknown Native capability preserves bounded best-effort commands without certifying support', () => {
  const observed = status({ seekability: { status: 'unknown', reason: 'not-exposed' } })
  assert.deepEqual(seekBounds(observed), { min: 0, max: 10, duration: 10 })
  assert.equal(seekTime(100, observed), 10)
  assert.equal(videoControlState(observed).forwardDisabled, false)
  const live = { ...observed, duration: null }
  assert.equal(seekBounds(live), null)
  assert.equal(seekTime(50, live), 50)
  assert.equal(seekBounds(status({ duration: null })), null, 'live-window slider is not claimed')
})

test('published/input ranges are detached from source-owned observations and each other', () => {
  const observer = new VideoObserver('clip', () => ({}))
  const input = {
    status: 'available' as const,
    origin: 'engine' as const,
    ranges: [{ start: 2, end: 9 }],
  }
  observer.update({ status: 'ready', duration: 10, seekability: input })
  const inputRange = input.ranges[0]
  assert.ok(inputRange)
  inputRange.end = 100
  const published = observer.snapshot().seekability
  assert.equal(published.status, 'available')
  if (published.status === 'available') {
    const publishedRange = published.ranges[0]
    assert.ok(publishedRange)
    publishedRange.end = 200
  }
  assert.deepEqual(observer.snapshot().seekability, {
    status: 'available',
    origin: 'engine',
    ranges: [{ start: 2, end: 9 }],
  })
  observer.dispose()
  observer.update({
    seekability: { status: 'unavailable', origin: 'engine', reason: 'empty-ranges' },
  })
  assert.equal(observer.snapshot().seekability.status, 'available')
})
