import { createContext, type ReactNode, useContext } from 'react'

import type { HozoNavigationAdapter } from './navigation.ts'

const NavigationContext = createContext<HozoNavigationAdapter | null>(null)

export interface HozoNavigationProviderProps {
  adapter: HozoNavigationAdapter
  children?: ReactNode
}

/** Internal provider used by the public `@hozo/navigation` integration. */
export function HozoNavigationProvider({ adapter, children }: HozoNavigationProviderProps) {
  return <NavigationContext value={adapter}>{children}</NavigationContext>
}

/** Returns null when an application deliberately has no router integration. */
export function useHozoNavigation(): HozoNavigationAdapter | null {
  return useContext(NavigationContext)
}
