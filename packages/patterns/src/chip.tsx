import { useHozoMessage } from '@hozo/behaviors'
import { type KeyboardEvent, type ReactNode, useCallback, useState } from 'react'

export interface HozoChipProps {
  /** The chip's label. A string also names its remove button. */
  children?: ReactNode
  /**
   * The chip's name when `children` is not a string -- an icon, or a label
   * that says less than a reader needs. Also what the remove button says it
   * removes.
   */
  accessibilityLabel?: string
  /**
   * Makes the chip a toggle: a filter that is on or off. `aria-pressed` on
   * the Web, `togglebutton` with `checked` on React Native.
   */
  selected?: boolean
  defaultSelected?: boolean
  onSelectedChange?: (selected: boolean) => void
  /**
   * Makes the chip removable: a remove button beside the label, and Delete
   * or Backspace on a selectable chip. Where focus goes once the chip is gone
   * is the application's, because only it knows what is next.
   */
  onRemove?: () => void
  /** Overrides the remove button's name, "Remove {label}" by default. */
  removeLabel?: string
  /** What the remove button shows; `×` by default. Hidden from readers. */
  removeIcon?: ReactNode
  disabled?: boolean
  className?: string
  removeClassName?: string
}

/**
 * A compact token: a filter that can be on or off, an entry that can be
 * removed, or both (#141).
 *
 * ## Two controls, not one with two jobs
 *
 * A selectable chip is a toggle button, and its remove action is a separate
 * button beside it. Folding removal into the toggle -- a click on the `×`
 * area of one element -- would give a reader one control whose activation
 * means two different things depending on where a pointer was, which a
 * keyboard and a screen reader cannot point at. Delete and Backspace on the
 * toggle remove it as well, because that is what a chip in an input does and
 * what people reach for.
 *
 * A chip that is neither selectable nor removable is a label, and is a
 * `<span>`: there is nothing to press.
 */
export function HozoChip({
  children,
  accessibilityLabel,
  selected,
  defaultSelected,
  onSelectedChange,
  onRemove,
  removeLabel,
  removeIcon = '×',
  disabled,
  className,
  removeClassName,
}: HozoChipProps) {
  const message = useHozoMessage()
  const selectable =
    selected !== undefined || defaultSelected !== undefined || onSelectedChange !== undefined
  const [uncontrolled, setUncontrolled] = useState(defaultSelected ?? false)
  const on = selected ?? uncontrolled
  const toggle = useCallback(() => {
    const next = !on
    if (selected === undefined) setUncontrolled(next)
    onSelectedChange?.(next)
  }, [on, onSelectedChange, selected])

  const label = accessibilityLabel ?? (typeof children === 'string' ? children : undefined)
  const remove = onRemove ? (
    <button
      type="button"
      aria-label={message('hozo.chip.remove', { label: label ?? '' }, removeLabel)}
      disabled={disabled}
      className={removeClassName}
      onClick={onRemove}
    >
      <span aria-hidden="true">{removeIcon}</span>
    </button>
  ) : null

  const state = selectable ? (on ? 'selected' : 'unselected') : undefined
  if (!selectable) {
    return (
      <span className={className} data-hozo-state={state}>
        {children}
        {remove}
      </span>
    )
  }

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (onRemove && !disabled && (event.key === 'Delete' || event.key === 'Backspace')) {
      event.preventDefault()
      onRemove()
    }
  }
  const toggleButton = (
    <button
      type="button"
      aria-pressed={on}
      aria-label={accessibilityLabel}
      disabled={disabled}
      className={remove ? undefined : className}
      data-hozo-state={state}
      onClick={toggle}
      onKeyDown={onKeyDown}
    >
      {children}
    </button>
  )
  if (!remove) return toggleButton
  return (
    <span className={className} data-hozo-state={state}>
      {toggleButton}
      {remove}
    </span>
  )
}

export { HozoChip as Chip, type HozoChipProps as ChipProps }
