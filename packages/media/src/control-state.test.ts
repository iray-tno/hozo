import assert from 'node:assert/strict'
import test from 'node:test'
import { videoControlLabels, videoControlState } from './control-state.ts'
import type { VideoControlsProps } from './control-types.ts'
import type { VideoStatus } from './types.ts'

const props: VideoControlsProps = { player: { current: null }, status: null }
test('control configuration rejects invalid seek steps and empty names', () => {
  assert.equal(
    videoControlLabels({ ...props, labels: { play: undefined } }).labels.play,
    'Play video',
  )
  for (const seekStep of [0, -1, Infinity, NaN]) {
    assert.throws(() => videoControlLabels({ ...props, seekStep }), /positive and finite/)
  }
  assert.throws(() => videoControlLabels({ ...props, accessibilityLabel: ' ' }), /nonempty/)
  for (const key of ['play', 'pause', 'backward', 'forward'] as const) {
    assert.throws(() => videoControlLabels({ ...props, labels: { [key]: '' } }), /nonempty/)
  }
})
test('elapsed time floors decoder fractions and unknown duration is not presented as zero', () => {
  const { labels } = videoControlLabels(props)
  assert.equal(labels.position(0, null), '0:00 / duration unknown')
  assert.equal(labels.position(65.999, 120), '1:05 / 2:00')
  assert.equal(labels.position(3601, 7200), '60:01 / 120:00')
})
test('loading and error cannot be played or sought, but observed buffering playback can be paused', () => {
  const status: VideoStatus = {
    src: 'clip.mp4',
    status: 'loading',
    playing: false,
    buffering: true,
    currentTime: 0,
    duration: null,
    seekability: { status: 'unknown', reason: 'not-exposed' },
    error: null,
  }
  for (const snapshot of [null, status, { ...status, status: 'error' as const }]) {
    const state = videoControlState(snapshot)
    assert.ok(state.toggleDisabled && state.backwardDisabled && state.forwardDisabled)
  }
  assert.equal(videoControlState({ ...status, playing: true }).toggleDisabled, false)
  assert.equal(videoControlState({ ...status, playing: true }, true).toggleDisabled, true)
})
