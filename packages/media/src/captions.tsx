import type { MediaCaptionsProps } from './caption-types.ts'
import { useCaption } from './use-caption.ts'

export function MediaCaptions(props: MediaCaptionsProps) {
  const text = useCaption(props)
  if (!text) return null
  return (
    <div
      role="group"
      aria-label={props.accessibilityLabel}
      style={{ backgroundColor: '#0f172b', color: '#ffffff', padding: 12, borderRadius: 4 }}
    >
      {/* Readable on demand, not a live announcement over the media's audio. */}
      <p style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 16, lineHeight: 1.5 }}>{text}</p>
    </div>
  )
}
