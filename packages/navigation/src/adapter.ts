import type { HozoNavigationAdapter, HozoNavigationRequest } from '@hozo/runtime/navigation'

export type NavigationResult = boolean | undefined | Promise<boolean | undefined>

export interface NavigationAdapterOptions {
  /** Performs the router transition. Returning false asks Hozo to use the platform fallback. */
  onNavigate(href: string, request: Readonly<HozoNavigationRequest>): NavigationResult
  /** Selects destinations owned by the application router. */
  shouldHandle?: (href: string, request: Readonly<HozoNavigationRequest>) => boolean
}

/**
 * True for references a browser resolves inside the current application.
 *
 * Absolute and protocol-relative URLs are deliberately declined. An application
 * that owns an absolute universal link can opt in through `shouldHandle`.
 */
export function isLocalHref(href: string): boolean {
  const value = href.trim()
  if (!value || value.startsWith('//')) return false
  return !/^[a-z][a-z\d+.-]*:/i.test(value)
}

/** Turns an ordinary router callback into the small contract used by Hozo primitives. */
export function createNavigationAdapter({
  onNavigate,
  shouldHandle = isLocalHref,
}: NavigationAdapterOptions): HozoNavigationAdapter {
  return {
    navigate(request) {
      if (request.external || !shouldHandle(request.href, request)) return false
      const result = onNavigate(request.href, request)
      return result instanceof Promise
        ? result.then((handled) => handled !== false)
        : result !== false
    },
  }
}
