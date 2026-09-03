import React, { createContext, type ReactNode, useContext, useMemo } from 'react'

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

export function tabStops(options: Pick<RovingOptions, 'count' | 'active' | 'disabled'>): number[] {
  const { count, active } = options
  return Array.from({ length: count }, (_, index) => (index === active ? 0 : -1))
}

interface RovingFocusContextValue {
  active: number
  onItemFocus: (index: number) => void
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
  style?: Record<string, unknown> | unknown[]
}

/**
 * Universal `<RovingFocusGroup>` component for React Native.
 */
export function RovingFocusGroup({
  children,
  active,
  onActiveChange,
  style,
  ...props
}: RovingFocusGroupProps) {
  const contextValue = useMemo<RovingFocusContextValue>(
    () => ({
      active,
      onItemFocus: onActiveChange,
    }),
    [active, onActiveChange],
  )

  return React.createElement(
    'View',
    { style, ...props },
    React.createElement(RovingFocusContext.Provider, { value: contextValue }, children),
  )
}

export function useRovingItem(index: number) {
  const context = useContext(RovingFocusContext)
  if (!context) {
    return {
      isActive: true,
      onFocus: () => {},
    }
  }

  return {
    isActive: context.active === index,
    onFocus: () => context.onItemFocus(index),
  }
}
