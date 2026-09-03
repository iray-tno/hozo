import { nextIndex, type Orientation, type RovingKey, tabStops } from '@hozo/behaviors'
import { type KeyboardEvent, type ReactNode, type Ref, useCallback, useRef, useState } from 'react'

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
  wrap?: boolean
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
          key={`item-${at}`}
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

function readDirection(element: Element): string {
  if (typeof window === 'undefined') return 'ltr'
  return window.getComputedStyle(element).direction || 'ltr'
}

export {
  HozoToolbar as Toolbar,
  type HozoToolbarItem as ToolbarItem,
  type HozoToolbarProps as ToolbarProps,
}
