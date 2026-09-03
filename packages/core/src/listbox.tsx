import {
  isTypeaheadKey,
  nextIndex,
  nextSearch,
  type Orientation,
  type RovingKey,
  searchIndex,
} from '@hozo/behaviors'
import { type KeyboardEvent, type ReactNode, useCallback, useRef, useState } from 'react'

export interface HozoListboxOption<T> {
  value: T
  label: string
  render?: ReactNode
  disabled?: boolean
}

interface Shared<T> {
  options: readonly HozoListboxOption<T>[]
  orientation?: Orientation
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
    if (!multiple) toggle(at)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>, at: number) => {
    if (event.key === ' ' || event.key === 'Enter') {
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
      aria-multiselectable={multiple}
      className={className}
    >
      {options.map((option, at) => (
        <div
          key={`option-${at}`}
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

function readDirection(element: Element): string {
  if (typeof window === 'undefined') return 'ltr'
  return window.getComputedStyle(element).direction || 'ltr'
}

export {
  HozoListbox as Listbox,
  type HozoListboxOption as ListboxOption,
  type HozoListboxProps as ListboxProps,
}
