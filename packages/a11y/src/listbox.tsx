// A listbox: a set of options, one of which is chosen -- or several.
//
// `./roving.ts` for the movement and `./typeahead.ts` for the typing, and
// what is left is the selection model, which is the whole reason this is
// not the radio group with different roles.
//
// Single select follows focus, exactly as the radio group does and for the
// same reason: the control holds one value and a focused-but-unchosen
// option is a state it does not have.
//
// Multiple select must not, and that is the rule that gets broken. If
// arrowing selected, there would be no way to *move* without changing the
// answer -- someone walking down a list of twelve to find the fourth would
// select all four on the way. So focus and selection come apart: the
// arrows move, Space toggles, and `aria-multiselectable` tells a screen
// reader which of the two models it is looking at before the user finds
// out by pressing something.

import { useCallback, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

import { nextIndex, type Orientation, type RovingKey } from './roving.ts'
import { isTypeaheadKey, nextSearch, searchIndex } from './typeahead.ts'

export interface HozoListboxOption<T> {
  value: T
  /**
   * The option's text.
   *
   * A string because typeahead matches against it and a screen reader
   * reads it. Use `render` when it has to look like more than that.
   */
  label: string
  render?: ReactNode
  disabled?: boolean
}

interface Shared<T> {
  options: readonly HozoListboxOption<T>[]
  orientation?: Orientation
  /** The listbox's accessible name. */
  accessibilityLabel?: string
  className?: string
  optionClassName?: string
}

export interface HozoListboxSingleProps<T> extends Shared<T> {
  multiple?: false
  defaultValue?: T
  value?: T
  onValueChange?: (value: T) => void
}

export interface HozoListboxMultipleProps<T> extends Shared<T> {
  multiple: true
  defaultValue?: readonly T[]
  value?: readonly T[]
  onValueChange?: (value: T[]) => void
}

export type HozoListboxProps<T> = HozoListboxSingleProps<T> | HozoListboxMultipleProps<T>

export function HozoListbox<T>(props: HozoListboxProps<T>) {
  const {
    options,
    orientation = 'vertical',
    accessibilityLabel,
    className,
    optionClassName,
  } = props
  const multiple = props.multiple === true

  const [uncontrolled, setUncontrolled] = useState<T[]>(() =>
    props.defaultValue === undefined
      ? []
      : Array.isArray(props.defaultValue)
        ? [...(props.defaultValue as readonly T[])]
        : [props.defaultValue as T],
  )
  const chosen: readonly T[] =
    props.value === undefined
      ? uncontrolled
      : Array.isArray(props.value)
        ? (props.value as readonly T[])
        : [props.value as T]

  const [active, setActive] = useState(0)
  const refs = useRef<(HTMLDivElement | null)[]>([])
  const search = useRef({ text: '', at: 0 })

  const disabled = options.flatMap((option, at) => (option.disabled ? [at] : []))
  const labels = options.map((option) => option.label)

  const commit = useCallback(
    (next: T[]) => {
      if (props.value === undefined) setUncontrolled(next)
      if (props.multiple === true) props.onValueChange?.(next)
      else if (next[0] !== undefined) props.onValueChange?.(next[0])
    },
    [props],
  )

  const toggle = useCallback(
    (at: number) => {
      const option = options[at]
      if (!option || option.disabled) return
      if (!multiple) {
        commit([option.value])
        return
      }
      const already = chosen.includes(option.value)
      commit(already ? chosen.filter((v) => v !== option.value) : [...chosen, option.value])
    },
    [chosen, commit, multiple, options],
  )

  const move = (at: number) => {
    setActive(at)
    refs.current[at]?.focus()
    // Single select is the one that follows focus. Multiple must not: with
    // twelve options, walking to the fourth would select the first four.
    if (!multiple) toggle(at)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>, at: number) => {
    if (event.key === ' ' || event.key === 'Enter') {
      // Space is the toggle in a multi-select and the confirm in a single
      // one, where it changes nothing that arriving here has not already
      // changed. Handled before typeahead, which is why `isTypeaheadKey`
      // refuses a bare space.
      event.preventDefault()
      toggle(at)
      return
    }

    const moved = nextIndex(event.key as RovingKey, {
      count: options.length,
      active: at,
      orientation,
      disabled,
      rtl: readDirection(event.currentTarget) === 'rtl',
    })
    if (moved !== null) {
      event.preventDefault()
      move(moved)
      return
    }

    if (isTypeaheadKey(event.key, search.current.text !== '')) {
      const now = Date.now()
      const text = nextSearch(search.current.text, event.key, now - search.current.at)
      search.current = { text, at: now }
      const found = searchIndex(text, { labels, active: at, disabled })
      if (found !== null) {
        event.preventDefault()
        move(found)
      }
    }
  }

  // In a single-select listbox the tab stop is the chosen option, for the
  // reason the radio group's is: Tab in should land on the current answer.
  // In a multi-select there is no single answer to land on, so it is the
  // last-focused option, which is where the arrows left off.
  const stop = multiple
    ? active
    : (() => {
        const at = options.findIndex((option) => chosen.includes(option.value))
        return at !== -1 ? at : options.findIndex((_, index) => !disabled.includes(index))
      })()

  return (
    <div
      role="listbox"
      aria-label={accessibilityLabel}
      aria-orientation={orientation === 'both' ? undefined : orientation}
      // Said always, not only when true. A screen reader announces the
      // model when entering the list, and leaving it off a multi-select
      // means someone learns that several are allowed by trying.
      aria-multiselectable={multiple}
      className={className}
    >
      {options.map((option, at) => (
        <div
          key={at}
          ref={(node) => {
            refs.current[at] = node
          }}
          role="option"
          aria-selected={chosen.includes(option.value)}
          aria-disabled={option.disabled || undefined}
          tabIndex={at === stop ? 0 : -1}
          className={optionClassName}
          onKeyDown={(event) => onKeyDown(event, at)}
          onFocus={() => setActive(at)}
          onClick={() => toggle(at)}
        >
          {option.render ?? option.label}
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
