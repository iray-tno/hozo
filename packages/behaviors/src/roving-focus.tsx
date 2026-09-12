import {
  type CSSProperties,
  createContext,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
} from 'react'

import { nextIndex, type Orientation, type RovingKey, tabStops } from './roving-focus-rules.ts'

export {
  nextIndex,
  type Orientation,
  type RovingKey,
  type RovingOptions,
  tabStops,
} from './roving-focus-rules.ts'

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
