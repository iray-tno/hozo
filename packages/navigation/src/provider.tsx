import { HozoNavigationProvider } from '@hozo/runtime/navigation'
import { type ReactNode, useEffect, useMemo } from 'react'

import { createNavigationAdapter, type NavigationAdapterOptions } from './adapter.ts'
import { routeNavigationClick } from './web-click.ts'

export interface NavigationProviderProps extends NavigationAdapterOptions {
  children?: ReactNode
}

/**
 * Connects Hozo links to a client-side router without replacing semantic anchors.
 *
 * The document listener is intentional: compiled Web primitives are real `<a>`
 * elements and therefore do not need a component runtime. Modified clicks,
 * downloads, external links, and non-self targets remain entirely browser-owned.
 */
export function NavigationProvider({
  onNavigate,
  shouldHandle,
  children,
}: NavigationProviderProps) {
  const adapter = useMemo(
    () => createNavigationAdapter({ onNavigate, shouldHandle }),
    [onNavigate, shouldHandle],
  )

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      void routeNavigationClick(event, adapter, (href) => window.location.assign(href))
    }

    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [adapter])

  return <HozoNavigationProvider adapter={adapter}>{children}</HozoNavigationProvider>
}
