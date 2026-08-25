// SVG, as a namespace.
//
// One import for fourteen elements, and a namespace rather than a prefix
// because of a collision that is real in both directions: `Text` is an SVG
// element and it is also a Hozo primitive, and `SvgText` is a name neither
// the specification nor `react-native-svg` uses. `<Svg.Text>` keeps SVG's
// own vocabulary intact and keeps it out of everyone else's.
//
// These are the fallback path, not the compiled one. The compiler lowers
// `<Svg.Rect className="fill-blue-500" />` straight to `<rect class="…">`
// with the fill in a scoped rule; what runs here is what happens when it
// could not -- inside an expression it does not read, or in a project that
// has not added the compiler yet. So they are plain elements with the
// props passed through, which is all an SVG element is on this platform.
//
// The className reaches the element unchanged and the project-wide
// candidate stylesheet supplies its CSS, which is the same arrangement
// every other primitive in this package has.

import type { ReactNode, SVGProps } from 'react'

type Passthrough<T> = SVGProps<T> & { children?: ReactNode }

function element<T>(tag: string) {
  const Component = (props: Passthrough<T>) => {
    const { children, ...rest } = props
    // `createElement` with a string tag, so the intrinsic element does the
    // work. Typing it here rather than writing fourteen components is what
    // keeps this file from being fourteen copies of one line.
    return <Tag tag={tag} rest={rest}>{children}</Tag>
  }
  Component.displayName = tag
  return Component
}

function Tag({
  tag,
  rest,
  children,
}: {
  tag: string
  rest: Record<string, unknown>
  children?: ReactNode
}) {
  const Element = tag as 'svg'
  return <Element {...(rest as SVGProps<SVGSVGElement>)}>{children}</Element>
}

const Root = element<SVGSVGElement>('svg')

/**
 * The SVG root, and the namespace its elements live under.
 *
 * ```tsx
 * <Svg viewBox="0 0 100 50" className="w-full">
 *   <Svg.Rect className="fill-blue-500" width={40} height={50} />
 * </Svg>
 * ```
 */
export const Svg = Object.assign(Root, {
  G: element<SVGGElement>('g'),
  Rect: element<SVGRectElement>('rect'),
  Circle: element<SVGCircleElement>('circle'),
  Ellipse: element<SVGEllipseElement>('ellipse'),
  Line: element<SVGLineElement>('line'),
  Path: element<SVGPathElement>('path'),
  Polygon: element<SVGPolygonElement>('polygon'),
  Polyline: element<SVGPolylineElement>('polyline'),
  Text: element<SVGTextElement>('text'),
  Defs: element<SVGDefsElement>('defs'),
  // camelCase, and not because of a style preference: `linearGradient`
  // lowercased is an element that parses and never renders.
  LinearGradient: element<SVGLinearGradientElement>('linearGradient'),
  RadialGradient: element<SVGRadialGradientElement>('radialGradient'),
  Stop: element<SVGStopElement>('stop'),
  ClipPath: element<SVGClipPathElement>('clipPath'),
  Use: element<SVGUseElement>('use'),
})
