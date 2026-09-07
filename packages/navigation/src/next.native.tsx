import { type ReactNode, useMemo } from 'react'

import type { NavigationAdapterOptions } from './adapter.ts'
import { NavigationProvider } from './provider.native.tsx'
import { type NextRouterLike, nextRouterNavigation } from './router-adapters.ts'

export type { NextRouterLike } from './router-adapters.ts'
export { nextRouterNavigation } from './router-adapters.ts'

export interface NextNavigationProviderProps extends Omit<NavigationAdapterOptions, 'onNavigate'> {
  router: NextRouterLike
  children?: ReactNode
}

export function NextNavigationProvider({
  router,
  shouldHandle,
  children,
}: NextNavigationProviderProps) {
  const onNavigate = useMemo(() => nextRouterNavigation(router), [router])
  return (
    <NavigationProvider onNavigate={onNavigate} shouldHandle={shouldHandle}>
      {children}
    </NavigationProvider>
  )
}
