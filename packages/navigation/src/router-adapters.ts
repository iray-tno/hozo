import type { NavigationAdapterOptions } from './adapter.ts'

/** The stable imperative subset exposed by Next.js App Router. */
export interface NextRouterLike {
  push(href: string): unknown
}

/**
 * Expo Router and TanStack Router both narrow destinations from generated
 * route types. `never` lets those narrower functions satisfy this structural
 * seam; the adapter is the deliberate point where a runtime href crosses it.
 */
export interface ExpoRouterLike {
  navigate(href: never): unknown
}

export interface TanStackRouterLike {
  navigate(options: never): unknown
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
  return (href) => acceptedWhenComplete(router.push(href))
}

export function expoRouterNavigation(
  router: ExpoRouterLike,
): NavigationAdapterOptions['onNavigate'] {
  return (href) => acceptedWhenComplete(router.navigate(href as never))
}

export function tanStackRouterNavigation(
  router: TanStackRouterLike,
): NavigationAdapterOptions['onNavigate'] {
  return (href) => acceptedWhenComplete(router.navigate({ to: href } as never))
}
