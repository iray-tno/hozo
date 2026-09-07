import type {
  HozoNavigationAdapter,
  HozoNavigationFallback,
  HozoNavigationRequest,
} from '@hozo/runtime/navigation'

type RoutableClick = Pick<
  MouseEvent,
  'altKey' | 'button' | 'ctrlKey' | 'defaultPrevented' | 'metaKey' | 'shiftKey' | 'target'
>

type PreventableRoutableClick = RoutableClick & Pick<MouseEvent, 'preventDefault'>

interface ClosestElement {
  closest(selectors: string): Element | null
}

function canFindClosest(target: EventTarget | null): target is EventTarget & ClosestElement {
  return typeof (target as Partial<ClosestElement> | null)?.closest === 'function'
}

/**
 * Returns the navigation represented by an ordinary primary-button anchor click.
 * Browser affordances such as new-tab modifiers, downloads, and named targets stay native.
 */
export function navigationRequestForClick(event: RoutableClick): HozoNavigationRequest | null {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    !canFindClosest(event.target)
  ) {
    return null
  }

  const anchor = event.target.closest('a[href]')
  if (!anchor) return null

  const href = anchor.getAttribute('href')
  const target = anchor.getAttribute('target')?.toLowerCase()
  const rel = anchor.getAttribute('rel')?.toLowerCase().split(/\s+/)
  if (
    !href ||
    (target && target !== '_self') ||
    anchor.hasAttribute('download') ||
    rel?.includes('external')
  ) {
    return null
  }

  return { href }
}

/** Offers one eligible click to an adapter while retaining the browser as fallback. */
export function routeNavigationClick(
  event: PreventableRoutableClick,
  adapter: HozoNavigationAdapter,
  fallback: HozoNavigationFallback,
): void | Promise<void> {
  const request = navigationRequestForClick(event)
  if (!request) return

  const handled = adapter.navigate(request)
  // A synchronous decline leaves the untouched anchor to the browser. An
  // asynchronous router must reserve the click while it makes its decision.
  if (handled === false) return
  event.preventDefault()
  if (handled === true) return
  return handled.then(async (accepted) => {
    if (!accepted) await fallback(request.href)
  })
}
