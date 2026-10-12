import { constrainSeek, copySeekability } from './seek-policy.ts'
import type { MediaSeekability, VideoCallbacks, VideoError, VideoStatus } from './types.ts'

/** Detach nested evidence before passing a snapshot across an author callback. */
export function copyMediaStatus(status: VideoStatus): VideoStatus {
  return {
    ...status,
    seekability: copySeekability(status.seekability),
    error: status.error ? { ...status.error } : null,
  }
}

/** Both engines report observations, not a optimistic play/pause prop mirror. */
export class VideoObserver {
  private current: VideoStatus
  private active = true

  constructor(
    src: string,
    private callbacks: () => VideoCallbacks,
  ) {
    this.current = {
      src,
      status: 'loading',
      playing: false,
      buffering: false,
      currentTime: 0,
      duration: null,
      // Expo's current player APIs expose no seek capability/ranges. A clock or
      // accepted command cannot upgrade this to engine evidence.
      seekability: { status: 'unknown', reason: 'not-exposed' },
      error: null,
    }
  }

  snapshot(): VideoStatus {
    return copyMediaStatus(this.current)
  }

  update(patch: Partial<Omit<VideoStatus, 'src'>>) {
    if (!this.active) return
    const previous = this.current
    this.current = { ...previous, ...patch }
    if (patch.seekability) this.current.seekability = copySeekability(patch.seekability)
    this.callbacks().onStatusChange?.(this.snapshot())
    if (!this.active) return
    if (previous.playing !== this.current.playing) {
      if (this.current.playing) this.callbacks().onPlay?.()
      else this.callbacks().onPause?.()
    }
  }

  ended() {
    if (!this.active || this.current.status === 'ended') return
    this.update({ status: 'ended', playing: false, buffering: false })
    if (this.active) this.callbacks().onEnded?.()
  }

  fail(operation: VideoError['operation'], cause: unknown, seekability?: MediaSeekability) {
    const error: VideoError = {
      src: this.current.src,
      operation,
      message: cause instanceof Error ? cause.message : String(cause),
    }
    if (!this.active) return
    this.update(
      operation === 'load'
        ? { error, status: 'error', playing: false, buffering: false }
        : { error, ...(seekability ? { seekability } : {}) },
    )
    if (this.active) this.callbacks().onError?.({ ...error })
  }

  dispose() {
    this.active = false
  }
}

export function durationValue(value: number): number | null {
  return Number.isFinite(value) && value > 0 ? value : null
}

export function seekTime(seconds: number, status: VideoStatus): number {
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new RangeError('Media.seekTo requires finite, nonnegative seconds')
  }
  if (status.status === 'loading' || status.status === 'error') {
    throw new Error('Media is not ready to seek')
  }
  const target = constrainSeek(seconds, status)
  if (target === null) throw new Error('Media has no observed seekable range')
  return target
}
