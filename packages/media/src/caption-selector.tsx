import { useId } from 'react'
import { captionSelection, type MediaCaptionSelectorProps } from './caption-selection.ts'

export function MediaCaptionSelector(props: MediaCaptionSelectorProps) {
  const selection = captionSelection(props)
  const name = useId()
  return (
    <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
      <legend style={{ fontWeight: 600 }}>{selection.name}</legend>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {selection.choices.map((choice) => (
          <label
            key={choice.key}
            style={{ display: 'flex', alignItems: 'center', minHeight: 44, padding: 8, gap: 8 }}
          >
            <input
              type="radio"
              name={name}
              value={choice.value ?? ''}
              checked={choice.checked}
              disabled={choice.disabled}
              onChange={choice.activate}
              style={{ width: 24, height: 24, margin: 0 }}
            />
            <span>{choice.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
