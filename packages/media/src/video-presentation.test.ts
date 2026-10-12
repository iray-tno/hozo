import assert from 'node:assert/strict'
import test from 'node:test'
import { watchVideoFrame } from './dom-video-frame.ts'
import type { VideoStatus } from './types.ts'
import { VideoPresentation } from './video-presentation.ts'

const status = (patch: Partial<VideoStatus> = {}): VideoStatus => ({
  src: 'clip.mp4',
  status: 'ready',
  playing: false,
  buffering: false,
  currentTime: 0,
  duration: 4,
  seekability: { status: 'unknown', reason: 'not-exposed' },
  error: null,
  ...patch,
})

test('poster requires both viewing activity and a frame, in either order; metadata/paused clocks cannot reveal it', () => {
  for (const first of ['frame', 'viewing']) {
    const changes: boolean[] = []
    const owner = new VideoPresentation((changed) => changes.push(changed))
    owner.observe(status())
    owner.observe(status({ currentTime: 2 }))
    assert.equal(owner.showingPoster, true, 'a status clock alone is not a presentation request')
    if (first === 'frame') owner.frame()
    else owner.beginViewing()
    assert.equal(owner.showingPoster, true)
    if (first === 'frame') owner.observe(status({ playing: true }))
    else owner.frame()
    assert.equal(owner.showingPoster, false)
    owner.observe(status({ status: 'ended', currentTime: 4 }))
    assert.equal(owner.showingPoster, false, 'pause/end cannot bring a cover back')
    const before = changes.length
    owner.frame()
    owner.beginViewing()
    assert.equal(changes.length, before, 'quality-change frames cannot reset the cover')
    owner.dispose()
    owner.observe(status({ playing: true }))
    owner.frame()
    owner.beginViewing()
    assert.equal(changes.length, before)
    assert.equal(new VideoPresentation(() => {}).showingPoster, true)
  }
})

test('authored callback mutation cannot rewrite the internal presentation snapshot', () => {
  const owner = new VideoPresentation(() => {})
  const observed = status({
    error: { src: 'clip.mp4', operation: 'play', message: 'denied' },
    seekability: { status: 'available', origin: 'engine', ranges: [{ start: 0, end: 4 }] },
  })
  owner.observe(observed)
  observed.currentTime = 99
  if (observed.error) observed.error.message = 'overwritten'
  if (observed.seekability.status === 'available') {
    const range = observed.seekability.ranges[0]
    assert.ok(range)
    range.end = 0
  }
  assert.equal(owner.status?.currentTime, 0)
  assert.equal(owner.status?.error?.message, 'denied')
  assert.deepEqual(owner.status?.seekability, {
    status: 'available',
    origin: 'engine',
    ranges: [{ start: 0, end: 4 }],
  })
})

test('DOM compositor watcher cancels/ignores retired callbacks and never interprets metadata as a frame', () => {
  let callback = () => {}
  const cancelled: number[] = []
  let frames = 0
  const video = {
    readyState: 1,
    requestVideoFrameCallback(fn: () => void) {
      callback = fn
      return 42
    },
    cancelVideoFrameCallback(id: number) {
      cancelled.push(id)
    },
  } as unknown as HTMLVideoElement
  const stop = watchVideoFrame(video, () => frames++)
  assert.equal(frames, 0)
  stop()
  callback()
  assert.equal(frames, 0)
  assert.deepEqual(cancelled, [42])
  watchVideoFrame(video, () => frames++)
  callback()
  callback()
  assert.equal(frames, 1)
})

test('older DOM hosts use only current decoded data, detach on retirement, and accept an already decoded frame', () => {
  const target = new EventTarget()
  const video = Object.assign(target, { readyState: 1 }) as unknown as HTMLVideoElement
  let frames = 0
  const stop = watchVideoFrame(video, () => frames++)
  target.dispatchEvent(new Event('loadedmetadata'))
  target.dispatchEvent(new Event('loadeddata'))
  target.dispatchEvent(new Event('canplay'))
  assert.equal(frames, 0)
  Object.assign(target, { readyState: 2 })
  target.dispatchEvent(new Event('canplay'))
  assert.equal(frames, 1)
  stop()
  target.dispatchEvent(new Event('loadeddata'))
  assert.equal(frames, 1)
  const cached = watchVideoFrame(video, () => frames++)
  assert.equal(frames, 2)
  cached()
})
