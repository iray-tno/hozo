// The Web half of Hozo's tab strip.
//
// The same division as `./dialog.tsx`: what the platform decides is left
// to it, and what Hozo decides lives in a module with no `react` and no
// `document` in it -- here `./roving.ts`. There is no `<tabs>` element to
// delegate to, so more is written here than in the dialog, but the part
// that is easy to get wrong is still the part that is a pure function.
//
// The pattern is WAI-ARIA's, and the two halves people leave out are the
// ones this exists for: the group is *one* tab stop, and the arrow keys
// move within it. A tab strip whose tabs are each a tab stop is not a tab
// strip -- it is six controls in a row, and Tab past it takes six presses.

import { useCallback, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

import { nextIndex, tabStops, type Orientation, type RovingKey } from './roving.ts'

export interface HozoTab {
  /** The tab's label. */
  label: ReactNode
  /** What the tab shows. */
  content: ReactNode
  /**
   * Unavailable, but still present.
   *
   * Kept in the strip and skipped by the arrows rather than removed:
   * removing it renumbers the others and moves what someone was pointing
   * at, which is worse than announcing one they cannot open.
   */
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
  /** The strip's accessible name. A strip with no name announces as "tab list". */
  accessibilityLabel?: string
  className?: string
  tabListClassName?: string
  tabClassName?: string
  panelClassName?: string
}

/**
 * `manual` activation: arrowing moves focus and does not switch panels.
 *
 * The other half of the pattern -- `automatic`, where focus and selection
 * move together -- is not offered, and that is a decision rather than an
 * omission. Automatic is only correct when every panel is already loaded
 * and cheap to show; with anything else, arrowing from the first tab to
 * the fifth mounts four panels nobody asked for, and a screen reader
 * announces each one on the way past. The WAI-ARIA practices say to prefer
 * automatic *only* under that condition, and a component cannot know
 * whether it holds.
 *
 * So Enter and Space select, which is what every other widget in the page
 * already means by them.
 */
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
  // Focus is not selection under manual activation, so the strip has to
  // remember where the keyboard is separately from what is showing.
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
      // The strip's direction, read off the element rather than assumed:
      // an app can be right-to-left in one subtree.
      rtl: readDirection(event.currentTarget) === 'rtl',
    })
    if (at === null) return
    // Only now, once the key is known to be ours. Calling this on every
    // key press is how a widget swallows the page's own scrolling.
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
            key={at}
            ref={(node) => {
              refs.current[at] = node
            }}
            type="button"
            role="tab"
            id={`${base}-tab-${at}`}
            aria-controls={`${base}-panel-${at}`}
            aria-selected={at === selected}
            // `aria-disabled`, not the `disabled` attribute: a disabled
            // button is removed from the accessibility tree and cannot be
            // focused, so the strip would have gaps someone can neither
            // reach nor be told about. This way it is announced, holds its
            // place, and the arrows pass over it.
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
          key={at}
          role="tabpanel"
          id={`${base}-panel-${at}`}
          aria-labelledby={`${base}-tab-${at}`}
          hidden={at !== selected}
          // The panel is a tab stop of its own when it holds no focusable
          // content, so arrowing to a tab and pressing Tab lands somewhere
          // that announces the panel rather than skipping past it.
          tabIndex={at === selected ? 0 : undefined}
          className={panelClassName}
        >
          {at === selected ? tab.content : null}
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
