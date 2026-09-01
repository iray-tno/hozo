// A radio group.
//
// Third on `./roving.ts`, and the one that disagrees with the other two
// about the two things that matter most -- which is why it is worth
// having rather than telling people to use the tab strip with different
// roles.
//
// **Selection follows focus.** The tab strip refuses to do this and says
// why: arrowing through it would mount panels nobody asked for. A radio
// group has nothing to mount, and the WAI-ARIA practices are explicit that
// here the arrows *must* select -- because the group is a single value,
// and a focused-but-unselected radio is a state the control does not have.
// Someone arrowing to "Express" and tabbing away has chosen Express.
//
// **The tab stop is the checked one, not the focused one.** Everywhere
// else the group remembers where the keyboard was. Here it has to be the
// current value, because that is what Tab into the group should land on --
// arriving at the third option because that is where you were last time
// tells you nothing about what is selected now.

import { type KeyboardEvent, type ReactNode, useCallback, useId, useRef, useState } from 'react'

import { nextIndex, type Orientation, type RovingKey } from './roving.ts'

export interface HozoRadioOption<T> {
  value: T
  label: ReactNode
  disabled?: boolean
}

export interface HozoRadioGroupProps<T> {
  options: readonly HozoRadioOption<T>[]
  /** The chosen value when uncontrolled. */
  defaultValue?: T
  /** The chosen value, when the caller wants to own it. */
  value?: T
  onValueChange?: (value: T) => void
  /**
   * Vertical by default, unlike everything else here.
   *
   * A radio group is usually a stacked list, and the arrows that move
   * within it should be the ones that match. Both directions work either
   * way -- `both` is the setting for a grid of swatches.
   */
  orientation?: Orientation
  /** The group's accessible name. A group with none announces its options and not what they are for. */
  accessibilityLabel?: string
  className?: string
  optionClassName?: string
}

export function HozoRadioGroup<T>({
  options,
  defaultValue,
  value,
  onValueChange,
  orientation = 'vertical',
  accessibilityLabel,
  className,
  optionClassName,
}: HozoRadioGroupProps<T>) {
  const base = useId()
  const [uncontrolled, setUncontrolled] = useState<T | undefined>(defaultValue)
  const current = value ?? uncontrolled
  const refs = useRef<(HTMLDivElement | null)[]>([])

  const disabled = options.flatMap((option, at) => (option.disabled ? [at] : []))
  const checked = options.findIndex((option) => option.value === current)

  // Nothing chosen yet is an ordinary state, and the group still has to be
  // reachable: the tab stop goes to the first option that can take it, so
  // Tab lands somewhere and the arrows can start from there.
  const stop = checked !== -1 ? checked : options.findIndex((_, at) => !disabled.includes(at))

  const select = useCallback(
    (at: number) => {
      const option = options[at]
      if (!option || option.disabled) return
      if (value === undefined) setUncontrolled(option.value)
      onValueChange?.(option.value)
    },
    [onValueChange, options, value],
  )

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>, at: number) => {
    // Space chooses the focused option, which matters only when nothing is
    // chosen yet -- every other arrival at an option has already chosen it.
    if (event.key === ' ') {
      event.preventDefault()
      select(at)
      return
    }
    const moved = nextIndex(event.key as RovingKey, {
      count: options.length,
      active: at,
      orientation,
      disabled,
      rtl: readDirection(event.currentTarget) === 'rtl',
    })
    if (moved === null) return
    event.preventDefault()
    // Both, in this order: the arrow key is a choice here, not a walk.
    select(moved)
    refs.current[moved]?.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-label={accessibilityLabel}
      aria-orientation={orientation === 'both' ? undefined : orientation}
      className={className}
    >
      {options.map((option, at) => (
        <div
          key={at}
          ref={(node) => {
            refs.current[at] = node
          }}
          role="radio"
          id={`${base}-option-${at}`}
          aria-checked={at === checked}
          // Announced and skipped, the same choice the tab strip and the
          // menu make: the `disabled` attribute would take the option out
          // of the accessibility tree, and an option nobody can be told
          // about is worse than one they cannot choose.
          aria-disabled={option.disabled || undefined}
          tabIndex={at === stop ? 0 : -1}
          className={optionClassName}
          onKeyDown={(event) => onKeyDown(event, at)}
          onClick={() => select(at)}
        >
          {option.label}
        </div>
      ))}
    </div>
  )
}

/** The effective writing direction at `element`. */
function readDirection(element: Element): string {
  if (typeof window === 'undefined') return 'ltr'
  return window.getComputedStyle(element).direction || 'ltr'
}
