// A combobox: a text field with a list of options attached.
//
// The rules are in `./combobox.ts`, and the structural decision is the one
// worth reading before the code: **focus never leaves the field**.
//
// Everything else in this package moves focus, because in a tab strip or a
// menu the thing with focus is the thing you are acting on. A combobox is
// different only because the user is typing: a field that loses focus
// stops receiving keystrokes, so ArrowDown cannot move into the list. What
// moves instead is `aria-activedescendant`, an attribute on the field
// naming an option's id -- the field keeps focus and the screen reader
// announces the option anyway.
//
// Getting that wrong is the commonest structural mistake in a hand-built
// combobox, and it fails in a way that is invisible with a mouse: real
// focus moves into the list, and typing stops working entirely.

import {
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useId,
  useRef,
  useState,
} from 'react'

import { type Autocomplete, activeAfter, filterOptions, inlineCompletion } from './combobox.ts'

export interface HozoComboboxOption<T> {
  value: T
  /** The option's text. Typed against, completed to, announced. */
  label: string
  render?: ReactNode
  disabled?: boolean
}

export interface HozoComboboxProps<T> {
  options: readonly HozoComboboxOption<T>[]
  value?: T
  onValueChange?: (value: T) => void
  /**
   * How much the field completes on its own.
   *
   * `list` filters and nothing else. `both` also completes inline, which
   * needs `match: 'starts'` to make sense -- completing "ma" to
   * "Birmingham" would rewrite what was typed. `none` filters nothing and
   * is for a field whose list is a suggestion rather than a constraint.
   */
  autocomplete?: Autocomplete
  match?: 'starts' | 'contains'
  /** The field's accessible name. Required in practice; a nameless field announces as "combo box". */
  accessibilityLabel?: string
  placeholder?: string
  className?: string
  inputClassName?: string
  listClassName?: string
  optionClassName?: string
  /** Shown in place of the list when nothing matches. */
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
  // Set by the keydown that precedes the change, because a change event
  // does not say what caused it -- and completing during a deletion makes
  // the field impossible to clear. See `inlineCompletion`.
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
    // After the state update, so React has written the value first --
    // otherwise the selection is set on text that is about to be replaced.
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
      // Close first; a second Escape clears, which is what a native
      // combobox does and what someone who has typed a wrong query
      // reaches for.
      event.preventDefault()
      if (open) close()
      else setQuery('')
      return
    }
    // Home and End belong to the *text*, not to the list. Taking them for
    // "first option" is a small theft that breaks editing a long query.
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
        // The whole mechanism. Focus stays here and this says which option
        // a screen reader should announce as current.
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
                    key={index}
                    role="option"
                    id={`${base}-option-${index}`}
                    aria-selected={at === active}
                    aria-disabled={option.disabled || undefined}
                    className={optionClassName}
                    // No `tabIndex`. An option that can take focus is an
                    // option the field can lose it to, and this pattern
                    // exists precisely so that never happens.
                    //
                    // `mousedown` rather than `click`: the field's own
                    // blur closes the list, and by the time a click
                    // arrives the option is gone.
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
      ) : null}
    </div>
  )
}
