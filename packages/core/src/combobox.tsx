import { FloatingPositioner } from '@hozo/behaviors'
import {
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useId,
  useRef,
  useState,
} from 'react'

import {
  type Autocomplete,
  activeAfter,
  filterOptions,
  inlineCompletion,
} from './combobox-rules.ts'

export interface HozoComboboxOption<T> {
  value: T
  label: string
  render?: ReactNode
  disabled?: boolean
}

export interface HozoComboboxProps<T> {
  options: readonly HozoComboboxOption<T>[]
  value?: T
  onValueChange?: (value: T) => void
  autocomplete?: Autocomplete
  match?: 'starts' | 'contains'
  accessibilityLabel?: string
  placeholder?: string
  className?: string
  inputClassName?: string
  listClassName?: string
  optionClassName?: string
  emptyMessage?: ReactNode
}

export function HozoCombobox<T>({
  options,
  value,
  onValueChange,
  autocomplete = 'list',
  match = 'starts',
  accessibilityLabel,
  placeholder,
  className,
  inputClassName,
  listClassName,
  optionClassName,
  emptyMessage,
}: HozoComboboxProps<T>) {
  const base = useId()
  const chosen = options.find((option) => option.value === value)
  const [query, setQuery] = useState(chosen?.label ?? '')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<number | null>(null)
  const input = useRef<HTMLInputElement | null>(null)
  const deleting = useRef(false)

  const visible =
    autocomplete === 'none'
      ? options.map((_, index) => index)
      : filterOptions({ query, labels: options.map((option) => option.label), match })

  const close = useCallback(() => {
    setOpen(false)
    setActive(null)
  }, [])

  const commit = useCallback(
    (at: number) => {
      const option = options[visible[at] ?? -1]
      if (!option || option.disabled) return
      setQuery(option.label)
      onValueChange?.(option.value)
      close()
      input.current?.focus()
    },
    [close, onValueChange, options, visible],
  )

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const typed = event.target.value
    setQuery(typed)
    setOpen(true)
    setActive(null)

    if (autocomplete !== 'both') return
    const first = filterOptions({ query: typed, labels: options.map((o) => o.label), match })[0]
    const completion = inlineCompletion(typed, options[first ?? -1]?.label, deleting.current)
    if (!completion) return
    setQuery(completion.value)
    queueMicrotask(() => {
      input.current?.setSelectionRange(completion.selectionStart, completion.selectionEnd)
    })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    deleting.current = event.key === 'Backspace' || event.key === 'Delete'

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        setOpen(true)
        setActive(activeAfter(event.key, null, visible.length))
        return
      }
      setActive(activeAfter(event.key, active, visible.length))
      return
    }
    if (event.key === 'Enter' && open && active !== null) {
      event.preventDefault()
      commit(active)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      if (open) close()
      else setQuery('')
      return
    }
  }

  const activeId = active !== null ? `${base}-option-${visible[active]}` : undefined

  return (
    <div className={className}>
      <input
        ref={input}
        type="text"
        role="combobox"
        aria-label={accessibilityLabel}
        aria-expanded={open}
        aria-controls={open ? `${base}-list` : undefined}
        aria-activedescendant={activeId}
        aria-autocomplete={autocomplete}
        autoComplete="off"
        placeholder={placeholder}
        className={inputClassName}
        value={query}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onBlur={close}
      />
      {open ? (
        <FloatingPositioner
          anchorRef={input}
          placement="bottom-start"
          matchAnchorWidth
          offset={4}
          flip
          shift
          className="z-50"
        >
          {() => (
            <div
              role="listbox"
              id={`${base}-list`}
              aria-label={accessibilityLabel}
              className={listClassName}
            >
              {visible.length === 0
                ? emptyMessage
                : visible.map((index, at) => {
                    const option = options[index]
                    if (!option) return null
                    return (
                      <div
                        key={`option-${index}`}
                        role="option"
                        id={`${base}-option-${index}`}
                        aria-selected={at === active}
                        aria-disabled={option.disabled || undefined}
                        className={optionClassName}
                        onMouseDown={(event) => {
                          event.preventDefault()
                          commit(at)
                        }}
                      >
                        {option.render ?? option.label}
                      </div>
                    )
                  })}
            </div>
          )}
        </FloatingPositioner>
      ) : null}
    </div>
  )
}

export {
  type Autocomplete,
  HozoCombobox as Combobox,
  type HozoComboboxOption as ComboboxOption,
  type HozoComboboxProps as ComboboxProps,
}
