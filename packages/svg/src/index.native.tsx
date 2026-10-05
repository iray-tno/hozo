// The author-facing namespace and the compiler ABI share one owner.
// `react-native-svg` already uses SVG's vocabulary, so the adapter is
// naming, navigation and raster-unit adaptation rather than another renderer.

import type { ComponentProps, JSXElementConstructor, RefAttributes } from 'react'
import { Platform } from 'react-native'
import * as NativeSvg from 'react-native-svg'
import { AndroidDropShadow, AndroidGaussianBlur, AndroidSvg } from './blur.native.tsx'
import { SvgLink } from './svg-link.native.tsx'

type PropsOf<T> = T extends JSXElementConstructor<infer Props> ? Props : never
type WithClassName<T extends JSXElementConstructor<never>> = T &
  JSXElementConstructor<PropsOf<T> & { className?: string }>

// A platform choice must expose one JSX signature, not a union of a class
// constructor and a forwardRef call signature. Both forward the same ref.
type AdaptedElement<Props, Instance> = JSXElementConstructor<
  Props & { className?: string } & RefAttributes<Instance>
>

// className is compile-time input: Hozo consumes it before these components
// render. Keep upstream identities except the Android raster adapters, while
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
export const Filter = withClassName(NativeSvg.Filter)
export const FeColorMatrix = withClassName(NativeSvg.FeColorMatrix)
export const FeGaussianBlur: AdaptedElement<
  ComponentProps<typeof NativeSvg.FeGaussianBlur>,
  NativeSvg.FeGaussianBlur
> = Platform.OS === 'android'
  ? withClassName(AndroidGaussianBlur)
  : withClassName(NativeSvg.FeGaussianBlur)
export const FeBlend = withClassName(NativeSvg.FeBlend)
export const FeComposite = withClassName(NativeSvg.FeComposite)
export const FeDropShadow: AdaptedElement<
  ComponentProps<typeof NativeSvg.FeDropShadow>,
  NativeSvg.FeDropShadow
> = Platform.OS === 'android'
  ? withClassName(AndroidDropShadow)
  : withClassName(NativeSvg.FeDropShadow)
export const FeFlood = withClassName(NativeSvg.FeFlood)
export const FeMerge = withClassName(NativeSvg.FeMerge)
export const FeMergeNode = withClassName(NativeSvg.FeMergeNode)
export const FeOffset = withClassName(NativeSvg.FeOffset)
const SvgRoot = Platform.OS === 'android' ? withClassName(AndroidSvg) : withClassName(NativeSvg.Svg)

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
  Filter,
  FeColorMatrix,
  FeGaussianBlur,
  FeBlend,
  FeComposite,
  FeDropShadow,
  FeFlood,
  FeMerge,
  FeMergeNode,
  FeOffset,
})
