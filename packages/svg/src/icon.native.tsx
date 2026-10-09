import { createElement } from 'react'
import * as NativeSvg from 'react-native-svg'
import {
  type IconBaseProps,
  type IconNode,
  iconShapes,
  nativeIconAccessibility,
} from './icon-node.ts'

export type { IconNode }
export type IconProps = IconBaseProps

const ELEMENT = {
  path: NativeSvg.Path,
  circle: NativeSvg.Circle,
  ellipse: NativeSvg.Ellipse,
  line: NativeSvg.Line,
  polygon: NativeSvg.Polygon,
  polyline: NativeSvg.Polyline,
  rect: NativeSvg.Rect,
} as const

/**
 * An icon on React Native: the same `IconNode` drawn with `react-native-svg`.
 *
 * `currentColor` has nothing to follow here -- a `View` passes no text colour
 * down -- so it resolves to the `color` given, or to black. Pass `color` from
 * the theme. Decoration unless named, as on the Web: hidden from a reader
 * with no name, one `image` element named for it with one.
 */
export function Icon({
  icon,
  size = 24,
  color,
  strokeWidth = 2,
  accessibilityLabel,
  testID,
}: IconProps) {
  return (
    <NativeSvg.Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      color={color}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      testID={testID}
      {...nativeIconAccessibility(accessibilityLabel)}
    >
      {iconShapes(icon).map(({ tag, key, props }) => {
        // Typed loosely: each element's props differ, and the attributes are
        // the icon set's, checked by the set rather than by this union.
        const Element = ELEMENT[tag as keyof typeof ELEMENT] as unknown as (
          p: Record<string, unknown>,
        ) => null
        return createElement(Element, { key, ...props })
      })}
    </NativeSvg.Svg>
  )
}
