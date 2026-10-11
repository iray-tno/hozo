import { audioControlProps } from './audio-control-props.ts'
import type { AudioControlsProps } from './audio-types.ts'
import { VideoControls } from './video-controls.native.tsx'

export function AudioControls(props: AudioControlsProps) {
  return <VideoControls {...audioControlProps(props)} />
}
