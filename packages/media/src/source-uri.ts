/** URL/URI already resolved by a bundler or application; never fetch/preflight it here. */
export function resolveMediaURI(source: string): string {
  if (typeof source !== 'string' || !source.trim())
    throw new TypeError('Media source resolution requires a nonempty URI')
  return source
}
