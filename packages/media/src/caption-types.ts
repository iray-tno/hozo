import type { MediaStatus } from './types.ts'

/** Plain text, in seconds; active on the half-open interval [start, end). */
export interface MediaCue {
  start: number
  end: number
  text: string
}

export interface MediaCaptionsProps {
  /** The source the cues describe, not just the latest status's source. */
  src: string
  status: MediaStatus | null
  /** Immutable, ordered by start time. Overlapping cues are supported. */
  cues: readonly MediaCue[]
  accessibilityLabel: string
  enabled?: boolean
}
