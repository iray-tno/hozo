import type { AudioControlsProps } from './audio-types.ts'

export function audioControlProps(props: AudioControlsProps): AudioControlsProps {
  return {
    ...props,
    accessibilityLabel: props.accessibilityLabel ?? 'Audio playback controls',
    labels: {
      ...props.labels,
      play: props.labels?.play ?? 'Play audio',
      pause: props.labels?.pause ?? 'Pause audio',
    },
  }
}
