export interface MediaCaptionOption {
  /** Stable author identity; not an index or a playback-engine track number. */
  id: string
  label: string
  disabled?: boolean
}

export interface MediaCaptionSelectorProps {
  options: readonly MediaCaptionOption[]
  /** null explicitly selects Off. The caller owns selection and track loading. */
  value: string | null
  onValueChange(value: string | null): void
  accessibilityLabel?: string
  offLabel?: string
  disabled?: boolean
}

export function captionSelection(props: MediaCaptionSelectorProps) {
  const name = props.accessibilityLabel ?? 'Caption language'
  const off = props.offLabel ?? 'Captions off'
  if (!name.trim() || !off.trim()) throw new TypeError('Caption selector names must be nonempty')
  if (typeof props.onValueChange !== 'function')
    throw new TypeError('Caption selector requires onValueChange')
  const ids = new Set<string>()
  for (const option of props.options) {
    if (!option.id.trim() || !option.label.trim() || ids.has(option.id))
      throw new TypeError('Caption options require unique nonempty ids and nonempty labels')
    ids.add(option.id)
  }
  if (props.value !== null && !ids.has(props.value))
    throw new TypeError('Selected caption id must belong to options, or be null for Off')
  const options = [{ id: null, label: off, disabled: false }, ...props.options]
  return {
    name,
    choices: options.map((option) => {
      const disabled = !!(props.disabled || option.disabled)
      const checked = props.value === option.id
      return {
        key: option.id === null ? 'off' : `track:${option.id}`,
        value: option.id,
        label: option.label,
        checked,
        disabled,
        activate() {
          // Controlled on both hosts: a request never changes the checked state.
          // Selecting the current radio does not toggle Off or emit again.
          if (!disabled && !checked) props.onValueChange(option.id)
        },
      }
    }),
  }
}
