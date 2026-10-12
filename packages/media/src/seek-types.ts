import type { RefObject } from 'react'
import type { MediaHandle, MediaStatus } from './types.ts'

export interface MediaSeekProps {
  player: RefObject<MediaHandle | null>
  status: MediaStatus | null
  disabled?: boolean
  /** Positive finite seconds, default 1. */
  step?: number
  accessibilityLabel?: string
  labels?: {
    unavailable?: string
    position?: (seconds: number, duration: number) => string
    preview?: (seconds: number, duration: number) => string
  }
}
