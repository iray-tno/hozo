/**
 * An icon as data: the shape `lucide` exports for every icon --
 * `[['path', { d: '…' }], ['circle', { cx: '12', … }]]` -- so an application
 * brings the icons it uses from the set it chose, and imports only those.
 *
 * Hozo bundles no icon set. A set of fifteen hundred icons re-exported from
 * one module is fifteen hundred icons in every Native bundle, because Metro
 * does not tree-shake; importing one icon's own module (`lucide/dist/esm/
 * icons/search.js`, or the set's per-icon entry) costs that icon alone.
 */
export type IconNode = readonly (readonly [
  tag: string,
  attributes: Readonly<Record<string, string | number>>,
])[]

/** The SVG elements an icon may be drawn with. Anything else is skipped. */
export const ICON_TAGS = new Set([
  'path',
  'circle',
  'ellipse',
  'line',
  'polygon',
  'polyline',
  'rect',
])

/**
 * React's names for an icon's attributes: `stroke-width` becomes
 * `strokeWidth`, and `key` -- which `lucide` puts on every element so a list
 * of them has one -- is taken out to be the key.
 */
export function iconAttributes(attributes: Readonly<Record<string, string | number>>): {
  key: string | undefined
  props: Record<string, string | number>
} {
  let key: string | undefined
  const props: Record<string, string | number> = {}
  for (const [name, value] of Object.entries(attributes)) {
    if (name === 'key') {
      key = String(value)
      continue
    }
    props[name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())] = value
  }
  return { key, props }
}

export interface IconBaseProps {
  /** The icon's shapes; see `IconNode`. */
  icon: IconNode
  /** Width and height, 24 by default -- the grid the common sets draw on. */
  size?: number | string
  /** The stroke colour: `currentColor` by default, which follows the text. */
  color?: string
  strokeWidth?: number
  /**
   * A name makes the icon an image a reader hears. Without one it is
   * decoration and hidden, which is what an icon beside a word is -- "search
   * icon, Search" is the word said twice. An icon that is the only thing on a
   * button can leave the name to the button.
   */
  accessibilityLabel?: string
  className?: string
  testID?: string
}

/**
 * The accessibility props for an icon on React Native: one `image` element
 * named for it when it has a name, hidden from a reader when it does not.
 * Shared so the decision is tested without `react-native-svg` rendering.
 */
export function nativeIconAccessibility(accessibilityLabel: string | undefined) {
  return accessibilityLabel !== undefined && accessibilityLabel !== ''
    ? { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel }
    : {
        accessibilityElementsHidden: true,
        importantForAccessibility: 'no-hide-descendants' as const,
      }
}

/** The drawable elements of an icon, with React's attribute names and keys. */
export function iconShapes(
  icon: IconNode,
): { tag: string; key: string; props: Record<string, string | number> }[] {
  return icon.flatMap(([tag, attributes], index) => {
    if (!ICON_TAGS.has(tag)) return []
    const { key, props } = iconAttributes(attributes)
    return [{ tag, key: key ?? String(index), props }]
  })
}
