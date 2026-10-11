import type { Ref } from 'react'
import type { VideoControlsProps } from './control-types.ts'
import type { MediaHandle, VideoCallbacks, VideoError, VideoOptions, VideoStatus } from './types.ts'

export type AudioError = VideoError
export type AudioStatus = VideoStatus
export interface AudioHandle extends MediaHandle {
  /** Resolves when the engine accepts/completes the seek, not sample-exact positioning. */
  seekTo(seconds: number): Promise<void>
}
export type AudioControlsProps = VideoControlsProps
export interface AudioProps extends VideoOptions, VideoCallbacks {
  src: string
  accessibilityLabel: string
  /** Shared controls on both platforms; default true. No Native platform control bar is invented. */
  controls?: boolean
  ref?: Ref<AudioHandle>
}

export function validateAudioProps({ src, accessibilityLabel }: AudioProps) {
  if (!src.trim()) throw new TypeError('Audio requires a nonempty src')
  if (!accessibilityLabel.trim()) throw new TypeError('Audio requires an accessibilityLabel')
}
