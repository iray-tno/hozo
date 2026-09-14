/** Resolve safe browser attributes for a destination that opens a new context. */
export function externalLinkAttributes(
  external: boolean | undefined,
  target: string | undefined,
  rel: string | undefined,
): { target: string | undefined; rel: string | undefined } {
  const finalTarget = external ? '_blank' : target
  return {
    target: finalTarget,
    rel: external || target === '_blank' ? (rel ?? 'noreferrer noopener') : rel,
  }
}
