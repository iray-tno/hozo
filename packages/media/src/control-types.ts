import type { RefObject } from 'react'
import type { MediaHandle, VideoStatus } from './types.ts'

export interface VideoControlsLabels {
  play: string
  pause: string
  backward: string
  forward: string
  /** Override for localized time/unknown-duration wording; seconds are observed values. */
  position: (currentTime: number, duration: number | null) => string
}

export interface VideoControlsProps {
  player: RefObject<MediaHandle | null>
  /** Connect to Video.onStatusChange; commands never optimistically change this state. */
  status: VideoStatus | null
  disabled?: boolean
  /** Positive finite seconds, default 10. Requests are clamped to a known duration. */
  seekStep?: number
  accessibilityLabel?: string
  labels?: Partial<VideoControlsLabels>
}
