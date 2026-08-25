// A toolbar: a row of controls that is one tab stop.
//
// The thinnest thing on `./roving.ts`, and the one where the pattern's
// value is most obvious. A toolbar is where "each control is a tab stop"
// hurts most -- a formatting bar with twelve buttons is twelve presses to
// get past on the way to the text, every time -- and it is also where the
// mistake is least visible, because with a mouse it behaves identically.
//
// Unlike the tab strip this owns no selection and renders no panels. The
// controls are the author's; what it supplies is the tab stop, the arrow
// keys, and the props that connect them.

import {
  useCallback,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react'

import { nextIndex, tabStops, type Orientation, type RovingKey } from './roving.ts'

/**
 * What an item has to put on its control.
 *
 * One object to spread rather than three props to remember, and a `ref`
 * among them because the toolbar has to be able to move focus. React 19
 * passes `ref` as an ordinary prop, so `<button {...props} />` is the
 * whole of what an author writes.
 *
 * An earlier version wrapped each item in a `display: contents` span and
 * found the control by query instead. It could not work: the query
 * returned the spans, and focusing a span with no tabindex does nothing at
 * all.
 */
export interface HozoToolbarItemProps {
  tabIndex: number
  onKeyDown: (event: KeyboardEvent) => void
  onFocus: () => void
  ref: Ref<HTMLElement>
}

export interface HozoToolbarItem {
  render: (props: HozoToolbarItemProps) => ReactNode
  disabled?: boolean
}

export interface HozoToolbarProps {
  items: readonly HozoToolbarItem[]
  orientation?: Orientation
  /**
   * Whether the ends join up.
   *
   * Off by default here, unlike the tab strip. A toolbar is a row of
   * unrelated actions rather than a ring of alternatives, and the WAI-ARIA
   * practices do not wrap it: arriving back at Bold after pressing Right
   * at the end of the bar reads as a jump rather than as a continuation.
   */
  wrap?: boolean
  /** The toolbar's accessible name. Without one it announces as "toolbar". */
  accessibilityLabel?: string
  className?: string
}

export function HozoToolbar({
  items,
  orientation = 'horizontal',
  wrap = false,
  accessibilityLabel,
  className,
}: HozoToolbarProps) {
  const [active, setActive] = useState(0)
  const refs = useRef<(HTMLElement | null)[]>([])
  const disabled = items.flatMap((item, at) => (item.disabled ? [at] : []))

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const at = nextIndex(event.key as RovingKey, {
        count: items.length,
        active,
        orientation,
        wrap,
        disabled,
        rtl: readDirection(event.currentTarget as Element) === 'rtl',
      })
      if (at === null) return
      event.preventDefault()
      setActive(at)
      refs.current[at]?.focus()
    },
    [active, disabled, items.length, orientation, wrap],
  )

  const stops = tabStops({ count: items.length, active, disabled })

  return (
    <div
      role="toolbar"
      aria-label={accessibilityLabel}
      aria-orientation={orientation === 'both' ? undefined : orientation}
      className={className}
    >
      {items.map((item, at) => (
        <Item
          key={at}
          render={item.render}
          tabIndex={stops[at] ?? -1}
          onKeyDown={onKeyDown}
          onFocus={() => setActive(at)}
          assign={(node) => {
            refs.current[at] = node
          }}
        />
      ))}
    </div>
  )
}

/** One item, so the ref callback is not rebuilt on every parent render. */
function Item({
  render,
  tabIndex,
  onKeyDown,
  onFocus,
  assign,
}: {
  render: (props: HozoToolbarItemProps) => ReactNode
  tabIndex: number
  onKeyDown: (event: KeyboardEvent) => void
  onFocus: () => void
  assign: (node: HTMLElement | null) => void
}) {
  return <>{render({ tabIndex, onKeyDown, onFocus, ref: assign })}</>
}

/** The effective writing direction at `element`. */
function readDirection(element: Element): string {
  if (typeof window === 'undefined') return 'ltr'
  return window.getComputedStyle(element).direction || 'ltr'
}
