import type { VideoCallbacks, VideoError, VideoStatus } from './types.ts'

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
      error: null,
    }
  }

  snapshot(): VideoStatus {
    return { ...this.current, error: this.current.error ? { ...this.current.error } : null }
  }

  update(patch: Partial<Omit<VideoStatus, 'src'>>) {
    if (!this.active) return
    const previous = this.current
    this.current = { ...previous, ...patch }
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

  fail(operation: VideoError['operation'], cause: unknown) {
    const error: VideoError = {
      src: this.current.src,
      operation,
      message: cause instanceof Error ? cause.message : String(cause),
    }
    if (!this.active) return
    this.update(
      operation === 'load'
        ? { error, status: 'error', playing: false, buffering: false }
        : { error },
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
    throw new RangeError('Video.seekTo requires finite, nonnegative seconds')
  }
  if (status.status === 'loading' || status.status === 'error') {
    throw new Error('Video is not ready to seek')
  }
  return status.duration === null ? seconds : Math.min(seconds, status.duration)
}
