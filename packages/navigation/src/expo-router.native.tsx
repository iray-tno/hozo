import { type ReactNode, useMemo } from 'react'

import type { NavigationAdapterOptions } from './adapter.ts'
import { NavigationProvider } from './provider.native.tsx'
import { type ExpoRouterLike, expoRouterNavigation, expoRouterPrefetch } from './router-adapters.ts'

export type { ExpoRouterLike } from './router-adapters.ts'
export { expoRouterNavigation, expoRouterPrefetch } from './router-adapters.ts'

export interface ExpoRouterNavigationProviderProps
  extends Omit<NavigationAdapterOptions, 'onNavigate' | 'onPrefetch'> {
  router: ExpoRouterLike
  children?: ReactNode
}

export function ExpoRouterNavigationProvider({
  router,
  shouldHandle,
  children,
}: ExpoRouterNavigationProviderProps) {
  const onNavigate = useMemo(() => expoRouterNavigation(router), [router])
  const onPrefetch = useMemo(() => expoRouterPrefetch(router), [router])
  return (
    <NavigationProvider onNavigate={onNavigate} onPrefetch={onPrefetch} shouldHandle={shouldHandle}>
      {children}
    </NavigationProvider>
  )
}
