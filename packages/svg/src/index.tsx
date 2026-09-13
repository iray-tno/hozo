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
import { SvgLink } from './svg-link.ts'

export { SvgLink, type SvgLinkProps } from './svg-link.ts'

type Passthrough<T> = SVGProps<T> & { children?: ReactNode }

function element<T>(tag: string) {
  const Component = (props: Passthrough<T>) => {
    const { children, ...rest } = props
    // `createElement` with a string tag, so the intrinsic element does the
    // work. Typing it here rather than writing fourteen components is what
    // keeps this file from being fourteen copies of one line.
    return (
      <Tag tag={tag} rest={rest}>
        {children}
      </Tag>
    )
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

// Named exports are the compiler ABI. Native lowering imports these names
// directly; the namespace below is the author-facing API.
export const G = element<SVGGElement>('g')
export const Rect = element<SVGRectElement>('rect')
export const Circle = element<SVGCircleElement>('circle')
export const Ellipse = element<SVGEllipseElement>('ellipse')
export const Line = element<SVGLineElement>('line')
export const Path = element<SVGPathElement>('path')
export const Polygon = element<SVGPolygonElement>('polygon')
export const Polyline = element<SVGPolylineElement>('polyline')
export const SvgText = element<SVGTextElement>('text')
export const Defs = element<SVGDefsElement>('defs')
export const LinearGradient = element<SVGLinearGradientElement>('linearGradient')
export const RadialGradient = element<SVGRadialGradientElement>('radialGradient')
export const Stop = element<SVGStopElement>('stop')
export const ClipPath = element<SVGClipPathElement>('clipPath')
export const Use = element<SVGUseElement>('use')
export const TSpan = element<SVGTSpanElement>('tspan')
export const TextPath = element<SVGTextPathElement>('textPath')
export const ForeignObject = element<SVGForeignObjectElement>('foreignObject')
export const Marker = element<SVGMarkerElement>('marker')
export const Mask = element<SVGMaskElement>('mask')
export const Pattern = element<SVGPatternElement>('pattern')
export const SvgSymbol = element<SVGSymbolElement>('symbol')
export const SvgImage = element<SVGImageElement>('image')

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
  /** A destination-bearing group: an SVG anchor on Web and a pressable group on Native. */
  Link: SvgLink,
  G,
  Rect,
  Circle,
  Ellipse,
  Line,
  Path,
  Polygon,
  Polyline,
  Text: SvgText,
  Defs,
  // camelCase, and not because of a style preference: `linearGradient`
  // lowercased is an element that parses and never renders.
  LinearGradient,
  RadialGradient,
  Stop,
  ClipPath,
  Use,
  // A run inside a `Text`, which is how a label gets a second line:
  // SVG has no wrapping of its own.
  TSpan,
  // camelCase for the same reason `linearGradient` is, and the reason
  // is worth repeating because it is silent: lowercased, these parse
  // and never render.
  TextPath,
  ForeignObject,
  Marker,
  Mask,
  Pattern,
  Symbol: SvgSymbol,
  // `Svg.Image` and not `Image`: this package exports a primitive of
  // that name, and the namespace is what keeps the two from arguing.
  Image: SvgImage,
})
