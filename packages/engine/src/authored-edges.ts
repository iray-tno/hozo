/** Each inline family as `[start, end, left, right]`, in React Native's keys. */
export const INLINE_EDGES = [
  ['paddingStart', 'paddingEnd', 'paddingLeft', 'paddingRight'],
  ['marginStart', 'marginEnd', 'marginLeft', 'marginRight'],
  ['start', 'end', 'left', 'right'],
  ['borderStartWidth', 'borderEndWidth', 'borderLeftWidth', 'borderRightWidth'],
  ['borderStartColor', 'borderEndColor', 'borderLeftColor', 'borderRightColor'],
] as const

export type InlineFamily = (typeof INLINE_EDGES)[number]

type Flat = Record<string, unknown>

function flatten(input: unknown, into: Flat): void {
  if (Array.isArray(input)) {
    for (const item of input) flatten(item, into)
  } else if (input && typeof input === 'object') {
    Object.assign(into, input)
  }
}

/**
 * The start and end a flat style resolves to on its own, as React Native lays
 * it out: without the swap Yoga prefers `paddingStart` to `paddingLeft`, and
 * `paddingLeft` is the start in LTR and the end in RTL; with the swap (RTL
 * only) `paddingLeft` is rewritten to `paddingStart` and overwrites it.
 */
function sides(
  style: Flat,
  [start, end, left, right]: InlineFamily,
  rtl: boolean,
  swap: boolean,
): [unknown, unknown] {
  const atStart = rtl && !swap ? style[right] : style[left]
  const atEnd = rtl && !swap ? style[left] : style[right]
  if (rtl && swap) return [atStart ?? style[start], atEnd ?? style[end]]
  return [style[start] ?? atStart, style[end] ?? atEnd]
}

/**
 * Compose an element's class styles with its author's `style` so the author
 * wins every inline edge it writes, as an inline style beats a class on the
 * Web (#2050). React Native does not compose that way: Yoga prefers
 * `paddingEnd` to `paddingRight` whatever the order, so
 * `className="px-8" style={{ paddingRight: 99 }}` kept the class's 32.
 *
 * The author's edge keeps the side React Native gives it on its own,
 * swap included, so a `style` means the same beside a class as without one.
 * Only the families the author writes are rewritten, to start/end for this
 * direction, which the swap leaves alone; everything else is the usual
 * last-wins flattening. Authored objects are never mutated.
 */
export function hozoAuthoredEdges(
  classes: readonly unknown[],
  authored: readonly unknown[],
  rtl: boolean,
  swap: boolean,
): unknown {
  const own: Flat = {}
  flatten(authored, own)
  const families = INLINE_EDGES.filter((family) =>
    family.some((key) => Object.hasOwn(own, key) && own[key] !== undefined),
  )
  if (families.length === 0) return [classes, authored]
  const base: Flat = {}
  flatten(classes, base)
  const flat: Flat = { ...base, ...own }
  for (const family of families) {
    const [ownStart, ownEnd] = sides(own, family, rtl, swap)
    const [baseStart, baseEnd] = sides(base, family, rtl, swap)
    for (const key of family) delete flat[key]
    const start = ownStart ?? baseStart
    const end = ownEnd ?? baseEnd
    if (start !== undefined) flat[family[0]] = start
    if (end !== undefined) flat[family[1]] = end
  }
  return flat
}
