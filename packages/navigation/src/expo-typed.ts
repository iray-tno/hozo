import { createTypedNavigationPrimitives } from './typed.ts'

/**
 * Narrows Hozo destinations with Expo Router's generated Href union while
 * retaining a concrete URL for Web anchors.
 */
export function createExpoRouterNavigationPrimitives<Destination>(
  resolveHref: (destination: Destination) => string,
) {
  return createTypedNavigationPrimitives<Destination>({
    resolveHref,
  })
}
