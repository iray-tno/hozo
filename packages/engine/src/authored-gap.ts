/**
 * Project a flattened author's StyleProp, not a mixture with compiled styles.
 * Yoga prefers an axis gutter to `gap` regardless of object key/array order.
 * CSS needs the effective longhands instead, or a later shorthand erases the
 * axis. The caller owns this flat object; authored objects are never mutated.
 * Keep CSS-only strings untouched rather than pretending RN accepts them.
 */
export function projectAuthoredGap(style: Record<string, unknown>): void {
  const gap = style.gap
  if (gap === undefined) return
  if (
    !(typeof gap === 'number' && Number.isFinite(gap) && gap >= 0) &&
    !(typeof gap === 'string' && /^(?:\d+(?:\.\d+)?|\.\d+)%$/.test(gap))
  )
    return
  if (!Object.hasOwn(style, 'gap')) return
  const row = style.rowGap ?? gap
  const column = style.columnGap ?? gap
  delete style.gap
  style.rowGap = row
  style.columnGap = column
}

/** Generated Native code calls this before mixing an author with class axes. */
export function hozoAuthoredStyle<T>(input: T): T {
  if (!input || typeof input !== 'object') return input
  if (!Array.isArray(input) && (!('gap' in input) || !Object.hasOwn(input, 'gap'))) return input
  // Flatten only the author's contribution. Reading it once also avoids a
  // pre-scan that would evaluate style accessors again during composition.
  const flat: Record<string, unknown> = {}
  function visit(value: unknown): void {
    if (Array.isArray(value)) {
      for (const item of value) visit(item)
    } else if (value && typeof value === 'object') {
      Object.assign(flat, value)
    }
  }
  visit(input)
  projectAuthoredGap(flat)
  return flat as T
}
