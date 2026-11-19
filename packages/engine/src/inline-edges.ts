/**
 * Each inline family as `[start, end, left, right]`, in React Native's keys.
 * Its own module so the class resolver, which reads it, does not also load
 * the authored-edge and spread composers.
 */
export const INLINE_EDGES = [
  ['paddingStart', 'paddingEnd', 'paddingLeft', 'paddingRight'],
  ['marginStart', 'marginEnd', 'marginLeft', 'marginRight'],
  ['start', 'end', 'left', 'right'],
  ['borderStartWidth', 'borderEndWidth', 'borderLeftWidth', 'borderRightWidth'],
  ['borderStartColor', 'borderEndColor', 'borderLeftColor', 'borderRightColor'],
] as const

export type InlineFamily = (typeof INLINE_EDGES)[number]
