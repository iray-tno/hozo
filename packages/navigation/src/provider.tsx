import { HozoNavigationProvider } from '@hozo/runtime/navigation'
import { type ReactNode, useEffect, useMemo } from 'react'

import { createNavigationAdapter, type NavigationAdapterOptions } from './adapter.ts'
import { routeNavigationClick } from './web-click.ts'
import { routeNavigationPrefetch } from './web-prefetch.ts'

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
  onPrefetch,
  shouldHandle,
  children,
}: NavigationProviderProps) {
  const adapter = useMemo(
    () => createNavigationAdapter({ onNavigate, onPrefetch, shouldHandle }),
    [onNavigate, onPrefetch, shouldHandle],
  )

  useEffect(() => {
    const prefetched = new WeakMap<Element, string>()
    const onClick = (event: MouseEvent) => {
      void routeNavigationClick(event, adapter, (href) => window.location.assign(href))
    }
    const onPrefetchIntent = (event: Event) => routeNavigationPrefetch(event, adapter, prefetched)

    document.addEventListener('click', onClick)
    document.addEventListener('pointerover', onPrefetchIntent)
    document.addEventListener('focusin', onPrefetchIntent)
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('pointerover', onPrefetchIntent)
      document.removeEventListener('focusin', onPrefetchIntent)
    }
  }, [adapter])

  return <HozoNavigationProvider adapter={adapter}>{children}</HozoNavigationProvider>
}
