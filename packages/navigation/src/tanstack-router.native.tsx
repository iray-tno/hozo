import { type ReactNode, useMemo } from 'react'

import type { NavigationAdapterOptions } from './adapter.ts'
import { NavigationProvider } from './provider.native.tsx'
import { type TanStackRouterLike, tanStackRouterNavigation } from './router-adapters.ts'

export type { TanStackRouterLike } from './router-adapters.ts'
export { tanStackRouterNavigation } from './router-adapters.ts'

export interface TanStackNavigationProviderProps
  extends Omit<NavigationAdapterOptions, 'onNavigate'> {
  router: TanStackRouterLike
  children?: ReactNode
}

export function TanStackNavigationProvider({
  router,
  shouldHandle,
  children,
}: TanStackNavigationProviderProps) {
  const onNavigate = useMemo(() => tanStackRouterNavigation(router), [router])
  return (
    <NavigationProvider onNavigate={onNavigate} shouldHandle={shouldHandle}>
      {children}
    </NavigationProvider>
  )
}
