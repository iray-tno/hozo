import { HozoNavigationProvider } from '@hozo/runtime/navigation'
import { type ReactNode, useMemo } from 'react'

import { createNavigationAdapter, type NavigationAdapterOptions } from './adapter.ts'

export interface NavigationProviderProps extends NavigationAdapterOptions {
  children?: ReactNode
}

/** Connects destination-bearing Native primitives to an application router. */
export function NavigationProvider({
  onNavigate,
  shouldHandle,
  children,
}: NavigationProviderProps) {
  const adapter = useMemo(
    () => createNavigationAdapter({ onNavigate, shouldHandle }),
    [onNavigate, shouldHandle],
  )
  return <HozoNavigationProvider adapter={adapter}>{children}</HozoNavigationProvider>
}
