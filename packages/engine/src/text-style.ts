import type { StyleObject } from './class-resolver.ts'

/** Properties drawn by a Native Text rather than by its containing View. */
const TEXT_KEYS = new Set([
  'color',
  'fontFamily',
  'fontSize',
  'fontStyle',
  'fontVariant',
  'fontWeight',
  'letterSpacing',
  'lineHeight',
  'textAlign',
  'textDecorationColor',
  'textDecorationLine',
  'textDecorationStyle',
  'textShadowColor',
  'textShadowOffset',
  'textShadowRadius',
  'textTransform',
])

/**
 * Partition an already resolved, flattened Native style. Resolution and
 * last-wins composition remain the caller's existing platform operations;
 * this neither interprets classes nor publishes inherited text context.
 */
export function hozoSplitTextStyle(style: Readonly<StyleObject>): [StyleObject, StyleObject] {
  const box: StyleObject = {}
  const text: StyleObject = {}
  for (const [key, value] of Object.entries(style)) {
    ;(TEXT_KEYS.has(key) ? text : box)[key] = value
  }
  return [box, text]
}
