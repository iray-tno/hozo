/** A destination-bearing interaction after component-specific events run. */
export interface HozoNavigationRequest {
  href: string
  /** Bypass application routing and use the platform destination handler. */
  external?: boolean
  /** Replace the current router history entry instead of pushing a new one. */
  replace?: boolean
}

/**
 * The deliberately small seam between universal primitives and a router.
 *
 * `true` means the router accepted the destination. Returning `false` lets
 * the platform fallback handle it instead. The adapter owns route matching;
 * the runtime cannot reliably infer whether an absolute URL belongs to an
 * application, or whether a custom scheme is an internal native route.
 */
export interface HozoNavigationAdapter {
  navigate(request: HozoNavigationRequest): boolean | Promise<boolean>
  /** Warms an application-owned destination without navigating to it. */
  prefetch?(request: HozoNavigationRequest): unknown | Promise<unknown>
}

export type HozoNavigationFallback = (href: string) => unknown | Promise<unknown>

/**
 * Offers an internal destination to the installed router, then falls back.
 *
 * Explicit external links never enter application routing. A declined route
 * and an absent adapter are equivalent, which keeps every primitive useful
 * before `@hozo/navigation` is installed and prevents the adapter from
 * becoming a required global singleton.
 */
export async function activateHozoNavigation(
  adapter: HozoNavigationAdapter | null,
  request: HozoNavigationRequest,
  fallback: HozoNavigationFallback,
): Promise<void> {
  if (!request.external && adapter && (await adapter.navigate(request))) return
  await fallback(request.href)
}

/** Offers a destination to an installed router without a platform fallback. */
export function prefetchHozoNavigation(
  adapter: HozoNavigationAdapter | null,
  request: HozoNavigationRequest,
): void {
  if (request.external) return
  try {
    const result = adapter?.prefetch?.(request)
    if (result !== undefined) void Promise.resolve(result).catch(() => {})
  } catch {
    // Prefetch is speculative. A cache warm-up must never break interaction.
  }
}
