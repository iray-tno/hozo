import type { VideoControlsProps } from './control-types.ts'
import { useVideoControls } from './use-video-controls.ts'

export function VideoControls(props: VideoControlsProps) {
  const controls = useVideoControls(props)
  return (
    <fieldset
      style={{ border: 0, margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      <legend style={{ fontWeight: 600 }}>{controls.name}</legend>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {[controls.toggle, controls.backward, controls.forward].map((control) => (
          <button
            key={control.key}
            type="button"
            disabled={control.disabled}
            onClick={control.activate}
            style={{ minHeight: 44, padding: 12, font: 'inherit' }}
          >
            {control.label}
          </button>
        ))}
      </div>
      <span>{controls.position}</span>
      {controls.error && <p role="alert">{controls.error}</p>}
    </fieldset>
  )
}
