import type { MediaCue } from './caption-types.ts'
import type { WebVTTParseError } from './webvtt.ts'

/** Return decoded text; respect signal where possible. Late results are ignored anyway. */
export type WebVTTTextLoader = (trackSrc: string, signal: AbortSignal) => Promise<string>

export interface WebVTTCaptionsOptions {
  /** The recording described by this track, independent of the track's URL. */
  mediaSrc: string
  /** null means that no track is selected. */
  trackSrc: string | null
  enabled?: boolean
  /** Stable function identity. Defaults to fetch + response.text(). */
  loadText?: WebVTTTextLoader
}

export interface WebVTTCaptionsError {
  mediaSrc: string
  trackSrc: string
  operation: 'load' | 'parse'
  message: string
  /** Parser details are null for acquisition/decoding failures. */
  code: WebVTTParseError['code'] | null
  line: number | null
}

export interface WebVTTCaptionsResult {
  mediaSrc: string
  trackSrc: string | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  /** Empty unless the current request completed successfully. */
  cues: readonly MediaCue[]
  error: WebVTTCaptionsError | null
  /** Explicit retry/refresh; no automatic retry or cross-source cache. */
  reload(): void
}
