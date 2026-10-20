// Generated-code protocol, not an author-facing Provider or style resolver.
// No RN import: typography readers and Native owners share these identities.
import { createContext, useContext, useMemo } from 'react'

export const HOZO_INHERITED_TEXT_FIELDS = [
  'fontSize',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'textAlign',
  'textTransform',
  'color',
] as const

export type HozoInheritedTextMetrics = Readonly<{
  fontSize?: number
  fontWeight?: string | number
  lineHeight?: number
  letterSpacing?: number
  textAlign?: string
  textTransform?: string
}>
export type HozoInheritedTextPaint = Readonly<{ color?: string | number }>
export type HozoInheritedTextFrame = Readonly<{
  metrics: HozoInheritedTextMetrics
  paint: HozoInheritedTextPaint
}>
export type HozoInheritedTextOwn = HozoInheritedTextMetrics & HozoInheritedTextPaint
const EMPTY = Object.freeze({})
export const HozoInheritedMetricsContext = createContext<HozoInheritedTextMetrics>(EMPTY)
export const HozoInheritedPaintContext = createContext<HozoInheritedTextPaint>(EMPTY)

export function useHozoInheritedTextFrame(own: HozoInheritedTextOwn): HozoInheritedTextFrame {
  const inherited = useContext(HozoInheritedMetricsContext)
  const inheritedPaint = useContext(HozoInheritedPaintContext)
  const fontSize = own.fontSize ?? inherited.fontSize
  const fontWeight = own.fontWeight ?? inherited.fontWeight
  const lineHeight = own.lineHeight ?? inherited.lineHeight
  const letterSpacing = own.letterSpacing ?? inherited.letterSpacing
  const textAlign = own.textAlign ?? inherited.textAlign
  const textTransform = own.textTransform ?? inherited.textTransform
  const color = own.color ?? inheritedPaint.color
  // Local overrides can keep the effective record stable even when an outer
  // owner changes. Never mutate a record shared with an earlier commit.
  const metrics = useMemo<HozoInheritedTextMetrics>(() => {
    const entries = Object.entries({
      fontSize,
      fontWeight,
      lineHeight,
      letterSpacing,
      textAlign,
      textTransform,
    }).filter(([, value]) => value != null)
    return entries.length ? Object.freeze(Object.fromEntries(entries)) : EMPTY
  }, [fontSize, fontWeight, lineHeight, letterSpacing, textAlign, textTransform])
  const paint = useMemo(() => (color == null ? EMPTY : Object.freeze({ color })), [color])
  return { metrics, paint }
}
