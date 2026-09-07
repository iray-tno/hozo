import { type HozoNavigationAdapter, prefetchHozoNavigation } from '@hozo/runtime/navigation'

interface ClosestElement {
  closest(selectors: string): Element | null
}

function canFindClosest(target: EventTarget | null): target is EventTarget & ClosestElement {
  return typeof (target as Partial<ClosestElement> | null)?.closest === 'function'
}

/** Best-effort intent prefetch for a marked semantic anchor, once per current href. */
export function routeNavigationPrefetch(
  event: Pick<Event, 'target'>,
  adapter: HozoNavigationAdapter,
  prefetched: WeakMap<Element, string>,
): void {
  if (!canFindClosest(event.target)) return
  const anchor = event.target.closest('a[data-hozo-navigation-prefetch][href]')
  if (!anchor || anchor.hasAttribute('data-hozo-disabled') || anchor.hasAttribute('download'))
    return

  const href = anchor.getAttribute('href')
  const target = anchor.getAttribute('target')?.toLowerCase()
  const rel = anchor.getAttribute('rel')?.toLowerCase().split(/\s+/)
  if (
    !href ||
    (target && target !== '_self') ||
    rel?.includes('external') ||
    prefetched.get(anchor) === href
  )
    return

  prefetched.set(anchor, href)
  prefetchHozoNavigation(adapter, {
    href,
    replace: anchor.hasAttribute('data-hozo-navigation-replace') || undefined,
  })
}
