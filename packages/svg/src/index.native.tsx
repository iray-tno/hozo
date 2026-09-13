// The author-facing namespace and the compiler ABI share one owner.
// `react-native-svg` already uses SVG's vocabulary, so the adapter is
// deliberately only naming and navigation rather than another renderer.

import type { JSXElementConstructor } from 'react'
import * as NativeSvg from 'react-native-svg'
import { SvgLink } from './svg-link.native.tsx'

type PropsOf<T> = T extends JSXElementConstructor<infer Props> ? Props : never
type WithClassName<T extends JSXElementConstructor<never>> = T &
  JSXElementConstructor<PropsOf<T> & { className?: string }>

// className is compile-time input: Hozo consumes it before these components
// render. Keep react-native-svg's runtime identity and full static type while
// making that authoring prop visible to TypeScript.
function withClassName<T extends JSXElementConstructor<never>>(component: T): WithClassName<T> {
  return component as WithClassName<T>
}

export const Circle = withClassName(NativeSvg.Circle)
export const ClipPath = withClassName(NativeSvg.ClipPath)
export const Defs = withClassName(NativeSvg.Defs)
export const Ellipse = withClassName(NativeSvg.Ellipse)
export const ForeignObject = withClassName(NativeSvg.ForeignObject)
export const G = withClassName(NativeSvg.G)
export const Line = withClassName(NativeSvg.Line)
export const LinearGradient = withClassName(NativeSvg.LinearGradient)
export const Marker = withClassName(NativeSvg.Marker)
export const Mask = withClassName(NativeSvg.Mask)
export const Path = withClassName(NativeSvg.Path)
export const Pattern = withClassName(NativeSvg.Pattern)
export const Polygon = withClassName(NativeSvg.Polygon)
export const Polyline = withClassName(NativeSvg.Polyline)
export const RadialGradient = withClassName(NativeSvg.RadialGradient)
export const Rect = withClassName(NativeSvg.Rect)
export const Stop = withClassName(NativeSvg.Stop)
export const SvgImage = withClassName(NativeSvg.Image)
export const SvgSymbol = withClassName(NativeSvg.Symbol)
export const SvgText = withClassName(NativeSvg.Text)
export const TextPath = withClassName(NativeSvg.TextPath)
export const TSpan = withClassName(NativeSvg.TSpan)
export const Use = withClassName(NativeSvg.Use)
const SvgRoot = withClassName(NativeSvg.Svg)

export type { SvgLinkProps } from './svg-link.native.tsx'
export { SvgLink }

/** The SVG root and its platform-neutral element namespace. */
export const Svg = Object.assign(SvgRoot, {
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
  LinearGradient,
  RadialGradient,
  Stop,
  ClipPath,
  Use,
  TSpan,
  TextPath,
  ForeignObject,
  Marker,
  Mask,
  Pattern,
  Symbol: SvgSymbol,
  Image: SvgImage,
})
