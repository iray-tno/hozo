import type { NavigationAdapterOptions, NavigationPrefetch } from './adapter.ts'

/** The stable imperative subset exposed by Next.js App Router. */
export interface NextRouterLike {
  push(href: string): unknown
  replace(href: string): unknown
  prefetch?(href: string): unknown
}

/**
 * Expo Router and TanStack Router both narrow destinations from generated
 * route types. `never` lets those narrower functions satisfy this structural
 * seam; the adapter is the deliberate point where a runtime href crosses it.
 */
export interface ExpoRouterLike {
  navigate(href: never): unknown
  replace(href: never): unknown
  prefetch?(href: never): unknown
}

export interface TanStackRouterLike {
  navigate(options: never): unknown
  preloadRoute?(options: never): unknown
}

function acceptedWhenComplete(result: unknown): true | Promise<true> {
  if (
    result !== null &&
    (typeof result === 'object' || typeof result === 'function') &&
    typeof (result as PromiseLike<unknown>).then === 'function'
  ) {
    return Promise.resolve(result).then(() => true)
  }
  return true
}

export function nextRouterNavigation(
  router: NextRouterLike,
): NavigationAdapterOptions['onNavigate'] {
  return (href, request) =>
    acceptedWhenComplete(request.replace ? router.replace(href) : router.push(href))
}

export function expoRouterNavigation(
  router: ExpoRouterLike,
): NavigationAdapterOptions['onNavigate'] {
  return (href, request) =>
    acceptedWhenComplete(
      request.replace ? router.replace(href as never) : router.navigate(href as never),
    )
}

export function tanStackRouterNavigation(
  router: TanStackRouterLike,
): NavigationAdapterOptions['onNavigate'] {
  return (href, request) =>
    acceptedWhenComplete(
      router.navigate((request.replace ? { to: href, replace: true } : { to: href }) as never),
    )
}

export function nextRouterPrefetch(router: NextRouterLike): NavigationPrefetch | undefined {
  return router.prefetch ? (href) => router.prefetch?.(href) : undefined
}

export function expoRouterPrefetch(router: ExpoRouterLike): NavigationPrefetch | undefined {
  return router.prefetch ? (href) => router.prefetch?.(href as never) : undefined
}

export function tanStackRouterPrefetch(router: TanStackRouterLike): NavigationPrefetch | undefined {
  return router.preloadRoute ? (href) => router.preloadRoute?.({ to: href } as never) : undefined
}
