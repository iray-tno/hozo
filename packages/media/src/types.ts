import type { Ref } from 'react'

export interface MediaError {
  src: string
  operation: 'load' | 'play' | 'seek'
  message: string
}

export interface MediaStatus {
  src: string
  status: 'loading' | 'ready' | 'ended' | 'error'
  playing: boolean
  buffering: boolean
  currentTime: number
  /** Unknown or unbounded durations are null, not an invented zero. */
  duration: number | null
  error: MediaError | null
}

export interface MediaHandle {
  /** Resolves when the request is accepted; onPlay observes actual playback. */
  play(): Promise<void>
  pause(): void
  /** Seconds; finite, nonnegative, clamped to a known duration. */
  seekTo(seconds: number): void | Promise<void>
  getStatus(): MediaStatus
}

export type VideoError = MediaError
export type VideoStatus = MediaStatus
export interface VideoHandle extends MediaHandle {
  seekTo(seconds: number): void
}

/** A small shared layout surface, not DOM styles silently accepted on Native. */
export interface VideoStyle {
  width?: number | `${number}%`
  height?: number | `${number}%`
  borderRadius?: number
  backgroundColor?: string
}

export interface VideoCallbacks {
  onStatusChange?: (status: VideoStatus) => void
  onPlay?: () => void
  onPause?: () => void
  onEnded?: () => void
  onError?: (error: VideoError) => void
}

export interface VideoOptions {
  autoPlay?: boolean
  loop?: boolean
  muted?: boolean
}

export interface VideoProps extends VideoOptions, VideoCallbacks {
  /** A URL or platform-resolvable URI. Numeric Metro assets are not part of v1. */
  src: string
  accessibilityLabel: string
  controls?: boolean
  /** Requests inline playback on Web; Native is inline until its controls open fullscreen. */
  playsInline?: boolean
  fit?: 'contain' | 'cover' | 'fill'
  style?: VideoStyle
  testID?: string
  ref?: Ref<VideoHandle>
}

export function validateVideoProps({ src, accessibilityLabel }: VideoProps) {
  if (!src.trim()) throw new TypeError('Video requires a nonempty src')
  if (!accessibilityLabel.trim()) throw new TypeError('Video requires an accessibilityLabel')
}
