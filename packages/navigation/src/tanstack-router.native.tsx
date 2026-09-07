import { type ReactNode, useMemo } from 'react'

import type { NavigationAdapterOptions } from './adapter.ts'
import { NavigationProvider } from './provider.native.tsx'
import {
  type TanStackRouterLike,
  tanStackRouterNavigation,
  tanStackRouterPrefetch,
} from './router-adapters.ts'

export type { TanStackRouterLike } from './router-adapters.ts'
export { tanStackRouterNavigation, tanStackRouterPrefetch } from './router-adapters.ts'

export interface TanStackNavigationProviderProps
  extends Omit<NavigationAdapterOptions, 'onNavigate' | 'onPrefetch'> {
  router: TanStackRouterLike
  children?: ReactNode
}

export function TanStackNavigationProvider({
  router,
  shouldHandle,
  children,
}: TanStackNavigationProviderProps) {
  const onNavigate = useMemo(() => tanStackRouterNavigation(router), [router])
  const onPrefetch = useMemo(() => tanStackRouterPrefetch(router), [router])
  return (
    <NavigationProvider onNavigate={onNavigate} onPrefetch={onPrefetch} shouldHandle={shouldHandle}>
      {children}
    </NavigationProvider>
  )
}
