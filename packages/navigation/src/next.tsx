import { type ReactNode, useMemo } from 'react'

import type { NavigationAdapterOptions } from './adapter.ts'
import { NavigationProvider } from './provider.tsx'
import { type NextRouterLike, nextRouterNavigation, nextRouterPrefetch } from './router-adapters.ts'

export type { NextRouterLike } from './router-adapters.ts'
export { nextRouterNavigation, nextRouterPrefetch } from './router-adapters.ts'

export interface NextNavigationProviderProps
  extends Omit<NavigationAdapterOptions, 'onNavigate' | 'onPrefetch'> {
  router: NextRouterLike
  children?: ReactNode
}

/** Connects a `next/navigation` App Router instance to Hozo. */
export function NextNavigationProvider({
  router,
  shouldHandle,
  children,
}: NextNavigationProviderProps) {
  const onNavigate = useMemo(() => nextRouterNavigation(router), [router])
  const onPrefetch = useMemo(() => nextRouterPrefetch(router), [router])
  return (
    <NavigationProvider onNavigate={onNavigate} onPrefetch={onPrefetch} shouldHandle={shouldHandle}>
      {children}
    </NavigationProvider>
  )
}
