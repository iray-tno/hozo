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
