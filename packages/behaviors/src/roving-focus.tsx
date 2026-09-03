import {
  type CSSProperties,
  createContext,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
} from 'react'

export type Orientation = 'horizontal' | 'vertical' | 'both'
export type RovingKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'Home' | 'End'

export interface RovingOptions {
  count: number
  active: number
  orientation?: Orientation
  wrap?: boolean
  disabled?: readonly number[]
  rtl?: boolean
}

function arrowStep(
  key: RovingKey,
  horizontal: boolean,
  vertical: boolean,
  rtl: boolean,
): number | null {
  switch (key) {
    case 'ArrowLeft':
      return horizontal ? (rtl ? 1 : -1) : null
    case 'ArrowRight':
      return horizontal ? (rtl ? -1 : 1) : null
    case 'ArrowUp':
      return vertical ? -1 : null
    case 'ArrowDown':
      return vertical ? 1 : null
    default:
      return null
  }
}

function seek(
  from: number,
  step: number,
  count: number,
  disabled: readonly number[],
  wrap: boolean,
  active: number,
): number {
  let index = from
  for (let moved = 0; moved <= count; moved += 1) {
    if (index < 0 || index >= count) {
      if (!wrap) return active
      index = index < 0 ? count - 1 : 0
    }
    if (!disabled.includes(index)) return index
    index += step
  }
  return active
}

export function nextIndex(key: RovingKey, options: RovingOptions): number | null {
  const {
    count,
    active,
    orientation = 'horizontal',
    wrap = true,
    disabled = [],
    rtl = false,
  } = options
  if (count <= 0) return null

  const horizontal = orientation === 'horizontal' || orientation === 'both'
  const vertical = orientation === 'vertical' || orientation === 'both'

  if (key === 'Home') return seek(0, 1, count, disabled, false, active)
  if (key === 'End') return seek(count - 1, -1, count, disabled, false, active)

  const step = arrowStep(key, horizontal, vertical, rtl)
  if (step === null) return null
  return seek(active + step, step, count, disabled, wrap, active)
}

export function tabStops(options: Pick<RovingOptions, 'count' | 'active' | 'disabled'>): number[] {
  const { count, active, disabled = [] } = options
  const stop = disabled.includes(active) ? seek(0, 1, count, disabled, false, active) : active
  return Array.from({ length: count }, (_, index) => (index === stop ? 0 : -1))
}

/** Context for composite roving focus items */
interface RovingFocusContextValue {
  active: number
  tabStops: number[]
  onItemFocus: (index: number) => void
  onItemKeyDown: (index: number, event: KeyboardEvent) => void
}

const RovingFocusContext = createContext<RovingFocusContextValue | null>(null)

export interface RovingFocusGroupProps {
  children?: ReactNode
  count: number
  active: number
  onActiveChange: (index: number) => void
  orientation?: Orientation
  wrap?: boolean
  disabled?: readonly number[]
  rtl?: boolean
  className?: string
  style?: CSSProperties
}

/**
 * Universal `<RovingFocusGroup>` component for Web.
 * Coordinates 1D and 2D arrow key navigation with a single active tab stop.
 */
export function RovingFocusGroup({
  children,
  count,
  active,
  onActiveChange,
  orientation = 'horizontal',
  wrap = true,
  disabled = [],
  rtl = false,
  className,
  style,
}: RovingFocusGroupProps) {
  const stops = useMemo(() => tabStops({ count, active, disabled }), [count, active, disabled])

  const handleItemKeyDown = useCallback(
    (index: number, event: KeyboardEvent) => {
      const key = event.key as RovingKey
      const next = nextIndex(key, {
        count,
        active: index,
        orientation,
        wrap,
        disabled,
        rtl,
      })

      if (next !== null && next !== index) {
        event.preventDefault()
        onActiveChange(next)
      }
    },
    [count, orientation, wrap, disabled, rtl, onActiveChange],
  )

  const contextValue = useMemo<RovingFocusContextValue>(
    () => ({
      active,
      tabStops: stops,
      onItemFocus: onActiveChange,
      onItemKeyDown: handleItemKeyDown,
    }),
    [active, stops, onActiveChange, handleItemKeyDown],
  )

  return (
    <RovingFocusContext.Provider value={contextValue}>
      <div className={className} style={style}>
        {children}
      </div>
    </RovingFocusContext.Provider>
  )
}

export function useRovingItem(index: number) {
  const context = useContext(RovingFocusContext)
  if (!context) {
    return {
      tabIndex: 0,
      onFocus: () => {},
      onKeyDown: () => {},
      isActive: true,
    }
  }

  return {
    tabIndex: context.tabStops[index] ?? -1,
    isActive: context.active === index,
    onFocus: () => context.onItemFocus(index),
    onKeyDown: (event: KeyboardEvent) => context.onItemKeyDown(index, event),
  }
}
