import { nextIndex, type Orientation, type RovingKey, tabStops } from '@hozo/behaviors'
import { type KeyboardEvent, type ReactNode, useCallback, useId, useRef, useState } from 'react'

export interface HozoTab {
  /** The tab's label. */
  label: ReactNode
  /** What the tab shows. */
  content: ReactNode
  /** Unavailable, but still present. Skipped by arrows. */
  disabled?: boolean
}

export interface HozoTabsProps {
  tabs: readonly HozoTab[]
  /** The tab shown when uncontrolled. */
  defaultIndex?: number
  /** The tab shown, when the caller wants to own that. */
  index?: number
  onIndexChange?: (index: number) => void
  orientation?: Orientation
  /** The strip's accessible name. */
  accessibilityLabel?: string
  className?: string
  tabListClassName?: string
  tabClassName?: string
  panelClassName?: string
}

export function HozoTabs({
  tabs,
  defaultIndex = 0,
  index,
  onIndexChange,
  orientation = 'horizontal',
  accessibilityLabel,
  className,
  tabListClassName,
  tabClassName,
  panelClassName,
}: HozoTabsProps) {
  const base = useId()
  const [uncontrolled, setUncontrolled] = useState(defaultIndex)
  const selected = index ?? uncontrolled
  const [focused, setFocused] = useState(selected)
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  const disabled = tabs.flatMap((tab, at) => (tab.disabled ? [at] : []))

  const select = useCallback(
    (at: number) => {
      if (tabs[at]?.disabled) return
      if (index === undefined) setUncontrolled(at)
      onIndexChange?.(at)
    },
    [index, onIndexChange, tabs],
  )

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const at = nextIndex(event.key as RovingKey, {
      count: tabs.length,
      active: focused,
      orientation,
      disabled,
      rtl: readDirection(event.currentTarget) === 'rtl',
    })
    if (at === null) return
    event.preventDefault()
    setFocused(at)
    refs.current[at]?.focus()
  }

  const stops = tabStops({ count: tabs.length, active: focused, disabled })

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label={accessibilityLabel}
        aria-orientation={orientation === 'both' ? undefined : orientation}
        className={tabListClassName}
      >
        {tabs.map((tab, at) => (
          <button
            key={`tab-${at}`}
            ref={(node) => {
              refs.current[at] = node
            }}
            type="button"
            role="tab"
            id={`${base}-tab-${at}`}
            aria-controls={`${base}-panel-${at}`}
            aria-selected={at === selected}
            aria-disabled={tab.disabled || undefined}
            tabIndex={stops[at]}
            className={tabClassName}
            onKeyDown={onKeyDown}
            onFocus={() => setFocused(at)}
            onClick={() => select(at)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab, at) => (
        <div
          key={`panel-${at}`}
          role="tabpanel"
          id={`${base}-panel-${at}`}
          aria-labelledby={`${base}-tab-${at}`}
          hidden={at !== selected}
          tabIndex={at === selected ? 0 : undefined}
          className={panelClassName}
        >
          {at === selected ? tab.content : null}
        </div>
      ))}
    </div>
  )
}

function readDirection(element: Element): string {
  if (typeof window === 'undefined') return 'ltr'
  return window.getComputedStyle(element).direction || 'ltr'
}

export { type HozoTab as Tab, HozoTabs as Tabs }
