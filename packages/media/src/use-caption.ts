import { useMemo } from 'react'
import { activeCaption, prepareCues } from './caption-timeline.ts'
import type { MediaCaptionsProps } from './caption-types.ts'

export function useCaption(props: MediaCaptionsProps): string {
  const cues = useMemo(() => prepareCues(props.cues), [props.cues])
  return activeCaption(props, cues)
}
