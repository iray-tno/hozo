import type { Ref } from 'react'
import { mediaPlaybackOptions } from './playback-rate.ts'
import { mediaVolume } from './volume.ts'

export interface MediaError {
  src: string
  operation: 'load' | 'play' | 'seek' | 'volume' | 'rate'
  message: string
}

export interface MediaSeekRange {
  /** Seconds on the source's media timeline, not byte/download ranges. */
  start: number
  end: number
}

/** Current engine evidence, not a promise that every seek will succeed. */
export type MediaSeekability =
  | { status: 'available'; origin: 'engine'; ranges: readonly MediaSeekRange[] }
  | { status: 'unavailable'; origin: 'engine'; reason: 'empty-ranges' }
  | { status: 'unknown'; reason: 'not-exposed' | 'not-observed' }

export interface MediaStatus {
  src: string
  status: 'loading' | 'ready' | 'ended' | 'error'
  playing: boolean
  buffering: boolean
  currentTime: number
  /** Unknown or unbounded durations are null, not an invented zero. */
  duration: number | null
  /** Empty engine ranges mean unavailable now; duration alone cannot prove support. */
  seekability: MediaSeekability
  error: MediaError | null
}

export interface MediaHandle {
  /** Resolves when the request is accepted; onPlay observes actual playback. */
  play(): Promise<void>
  pause(): void
  /** Seconds; finite, nonnegative, constrained to observed ranges or a known duration. */
  seekTo(seconds: number): void | Promise<void>
  getStatus(): MediaStatus
}

export type VideoError = MediaError
export type VideoStatus = MediaStatus
export interface VideoPosterError {
  src: string
  poster: string
  message: string
}
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
  /** Player gain, 0–1 inclusive; default 1. Independent of mute and OS volume. */
  volume?: number
  /** Requested speed, 0.25–2 inclusive; default 1. Zero is not pause. */
  playbackRate?: number
  /** Request engine pitch correction; default true, not identical DSP on each host. */
  preservesPitch?: boolean
}

export interface VideoProps extends VideoOptions, VideoCallbacks {
  /** A URL or platform-resolvable URI. Numeric Metro assets are not part of v1. */
  src: string
  /** Decorative URL/URI cover until viewing begins and a frame signal arrives. */
  poster?: string
  /** Poster failure does not turn a playable video into a decoder error. */
  onPosterError?: (error: VideoPosterError) => void
  accessibilityLabel: string
  controls?: boolean
  /** Requests inline playback on Web; Native is inline until its controls open fullscreen. */
  playsInline?: boolean
  fit?: 'contain' | 'cover' | 'fill'
  style?: VideoStyle
  testID?: string
  ref?: Ref<VideoHandle>
}

export function validateVideoProps(props: VideoProps) {
  const { src, accessibilityLabel, volume, poster } = props
  if (!src.trim()) throw new TypeError('Video requires a nonempty src')
  if (!accessibilityLabel.trim()) throw new TypeError('Video requires an accessibilityLabel')
  mediaVolume(volume)
  mediaPlaybackOptions(props)
  if (poster !== undefined && (typeof poster !== 'string' || !poster.trim())) {
    throw new TypeError('Video poster must be a nonempty URL or URI')
  }
}
