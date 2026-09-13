import { nextIndex, type Orientation, type RovingKey } from '@hozo/behaviors'
import { type KeyboardEvent, type ReactNode, useCallback, useId, useRef, useState } from 'react'
import { optionKey } from './option-key.ts'

export interface HozoRadioOption<T> {
  /**
   * An identity of the caller's own, when the value has none.
   *
   * Options are keyed by their value, which is how they are selected.
   * That works for a string or a number and not for an object, and not
   * for two options that genuinely share a value -- this is the way out
   * of both.
   */
  id?: string
  value: T
  label: ReactNode
  disabled?: boolean
}

export interface HozoRadioGroupProps<T> {
  options: readonly HozoRadioOption<T>[]
  defaultValue?: T
  value?: T
  onValueChange?: (value: T) => void
  orientation?: Orientation
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
          key={optionKey(option.value, option.id, at)}
          ref={(node) => {
            refs.current[at] = node
          }}
          role="radio"
          id={`${base}-option-${at}`}
          aria-checked={at === checked}
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

function readDirection(element: Element): string {
  if (typeof window === 'undefined') return 'ltr'
  return window.getComputedStyle(element).direction || 'ltr'
}

export {
  HozoRadioGroup as RadioGroup,
  type HozoRadioGroupProps as RadioGroupProps,
  type HozoRadioOption as RadioOption,
}
