import type { VideoControlsProps } from './control-types.ts'
import type { VideoStatus } from './types.ts'

function clock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(total / 60)
  return `${minutes}:${String(total % 60).padStart(2, '0')}`
}

export function videoControlLabels(props: VideoControlsProps) {
  const step = props.seekStep ?? 10
  if (!Number.isFinite(step) || step <= 0)
    throw new RangeError('seekStep must be positive and finite')
  const name = props.accessibilityLabel ?? 'Video playback controls'
  const seconds = step === 1 ? 'second' : 'seconds'
  const labels = {
    play: props.labels?.play ?? 'Play video',
    pause: props.labels?.pause ?? 'Pause video',
    backward: props.labels?.backward ?? `Seek backward ${step} ${seconds}`,
    forward: props.labels?.forward ?? `Seek forward ${step} ${seconds}`,
    position:
      props.labels?.position ??
      ((time: number, duration: number | null) =>
        `${clock(time)} / ${duration === null ? 'duration unknown' : clock(duration)}`),
  }
  for (const label of [name, labels.play, labels.pause, labels.backward, labels.forward]) {
    if (!label.trim()) throw new TypeError('Video controls require nonempty accessible names')
  }
  return { step, name, labels }
}

export function videoControlState(status: VideoStatus | null, disabled = false) {
  const ready = status?.status === 'ready' || status?.status === 'ended'
  return {
    playing: status?.playing ?? false,
    // A buffering player must still be pausable even if its engine says loading.
    toggleDisabled: disabled || !status || (!status.playing && !ready),
    backwardDisabled: disabled || !ready || !status || status.currentTime <= 0,
    forwardDisabled:
      disabled ||
      !ready ||
      !status ||
      (status.duration !== null && status.currentTime >= status.duration),
  }
}
