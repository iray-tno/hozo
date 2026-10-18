// Experimental reference B, not a shipped helper or a compiler decision.
// The harness substitutes these imports explicitly; production never does.
import { createRequire } from 'node:module'
import {
  Children,
  type Context,
  createContext,
  createElement,
  type ReactNode,
  useContext,
  useMemo,
} from 'react'
import { StyleSheet, Text, View } from './text-inheritance-host.ts'

const require = createRequire(import.meta.url)
const { HozoPressable } = require('../../primitives/src/pressable.native.tsx')
const { HozoTextSizeContext } = require('@hozo/engine') as { HozoTextSizeContext: Context<number> }
type State = { pressed: boolean; hovered: boolean; focused: boolean; focusVisible: boolean }
// Resolve the same entry as HozoPressable. Mixing its dist entry with a raw
// source import would create a second Context and silently read idle state.
const { HozoInteractionContext } = require('@hozo/behaviors/pressable-interaction') as {
  HozoInteractionContext: Context<State | null>
}
const IDLE: State = Object.freeze({
  pressed: false,
  hovered: false,
  focused: false,
  focusVisible: false,
})
type Style = Record<string, unknown>
type Metric = {
  fontSize?: number
  fontWeight?: string | number
  lineHeight?: number
  letterSpacing?: number
  textAlign?: string
  textTransform?: string
}
type Paint = { color?: string }
const EMPTY = Object.freeze({})
const Metrics = createContext<Metric>(EMPTY)
const Paints = createContext<Paint>(EMPTY)
const FIELDS = [
  'fontSize',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'textAlign',
  'textTransform',
  'color',
] as const

let executions: Record<string, number> = {}
let reads = { metrics: 0, paint: 0, legacySize: 0 }
const note = (name: string) => {
  executions[name] = (executions[name] ?? 0) + 1
}
export const referenceExecutions = () => ({ ...executions })
// Hook invocations during renders, not a count of live subscriptions or of
// native work. Keep them separate from component function executions.
export const referenceReads = () => ({ ...reads })
export const resetReferenceExecutions = () => {
  executions = {}
  reads = { metrics: 0, paint: 0, legacySize: 0 }
}
export const useReferenceMetrics = () => {
  reads.metrics += 1
  return useContext(Metrics)
}
export const useReferencePaint = () => {
  reads.paint += 1
  return useContext(Paints)
}

function flatStyle(style: unknown): Style {
  if (typeof style === 'function')
    throw new Error('reference does not evaluate host style callbacks')
  const flat = StyleSheet.flatten(style) as Style
  for (const field of FIELDS) {
    const value = flat[field]
    if (value != null && typeof value !== 'string' && typeof value !== 'number') {
      throw new Error(`unassessed reference value for ${field}`)
    }
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`non-finite ${field}`)
  }
  return flat
}

function useEffective(own: Style) {
  const inheritedMetrics = useReferenceMetrics()
  const inheritedPaint = useReferencePaint()
  return useResolved(own, inheritedMetrics, inheritedPaint)
}

function useResolved(own: Style, inheritedMetrics: Metric, inheritedPaint: Paint) {
  const fontSize = own.fontSize ?? inheritedMetrics.fontSize
  const fontWeight = own.fontWeight ?? inheritedMetrics.fontWeight
  const lineHeight = own.lineHeight ?? inheritedMetrics.lineHeight
  const letterSpacing = own.letterSpacing ?? inheritedMetrics.letterSpacing
  const textAlign = own.textAlign ?? inheritedMetrics.textAlign
  const textTransform = own.textTransform ?? inheritedMetrics.textTransform
  const color = own.color ?? inheritedPaint.color
  // Depend on effective scalar fields, not freshly allocated style records
  // or the outer context identity. An inner override can shield its readers.
  const metrics = useMemo(() => {
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

function Scope({
  frame,
  children,
}: {
  frame: ReturnType<typeof useEffective>
  children?: ReactNode
}) {
  note('Scope')
  reads.legacySize += 1
  const oldSize = useContext(HozoTextSizeContext)
  const size = typeof frame.metrics.fontSize === 'number' ? frame.metrics.fontSize : oldSize
  // The shape never depends on whether style currently exists. The old size
  // API reads this same resolved result; no independent second calculation.
  return createElement(
    Metrics.Provider,
    { value: frame.metrics },
    createElement(
      Paints.Provider,
      { value: frame.paint },
      createElement(HozoTextSizeContext.Provider, { value: size }, children),
    ),
  )
}

type Props = { children?: ReactNode; style?: unknown; [name: string]: unknown }

export function ReferenceText({ children, style, ...props }: Props) {
  note('ReferenceText')
  const frame = useEffective(flatStyle(style))
  return renderText(frame, children, style, props)
}

// Experimental C uses a different, statically selected component identity,
// never a hook selected by the current style value. Only the private proof
// pass may emit it. Metrics and descendant publication are still necessary:
// an own color does not mask weight/line-height or opaque descendant needs.
export function PaintMaskedText({ children, style, ...props }: Props) {
  note('PaintMaskedText')
  const own = flatStyle(style)
  if (typeof own.color !== 'string') throw new Error('missing static paint proof')
  const frame = useResolved(own, useReferenceMetrics(), EMPTY)
  return renderText(frame, children, style, props)
}

function renderText(
  frame: ReturnType<typeof useEffective>,
  children: ReactNode,
  style: unknown,
  props: Record<string, unknown>,
) {
  return createElement(
    Scope,
    { frame },
    // The effective record already includes local precedence. Apply it last
    // so an absent local field (e.g. color: undefined) resumes inheritance
    // instead of erasing the inherited value in RN's flattened style array.
    createElement(Text, { ...props, style: [style, frame.metrics, frame.paint] }, children),
  )
}

function textChildren(children: ReactNode): ReactNode {
  // Only raw scalar children need a Text. Never recurse into arbitrary
  // component implementations or turn a View subtree into an inline Text.
  return Children.map(children, (child: ReactNode) =>
    typeof child === 'string' || typeof child === 'number'
      ? createElement(ReferenceText, null, child)
      : child,
  )
}

export function ReferenceView({ children, style, ...props }: Props) {
  note('ReferenceView')
  const frame = useEffective(flatStyle(style))
  return createElement(
    Scope,
    { frame },
    createElement(View, { ...props, style }, textChildren(children)),
  )
}

function LabelScope({
  children,
  resolve,
  own,
}: {
  children?: ReactNode
  resolve?: (state: State) => unknown
  own?: unknown
}) {
  note('LabelScope')
  const state = useContext(HozoInteractionContext) ?? IDLE
  // Consume the compiler's callback exactly once, in place of the existing
  // direct-child forwarding. It uses the real owner's committed state.
  const frame = useEffective(flatStyle([resolve?.(state), flatStyle(own)]))
  return createElement(Scope, { frame }, textChildren(children))
}

export function ReferencePressable({
  children,
  hozoTextStyle,
  hozoTransition,
  style,
  ...props
}: {
  children?: ReactNode | ((state: { pressed: boolean }) => ReactNode)
  hozoTextStyle?: (state: State) => unknown
  hozoTransition?: unknown
  style?: unknown
  [name: string]: unknown
}) {
  note('ReferencePressable')
  if (hozoTransition) throw new Error('animated reference inheritance is not assessed')
  flatStyle(style)
  // Keep Hozo's event owner. This prototype adds no listener or new host.
  // Its label callback is consumed in LabelScope, not also by HozoPressable.
  return createElement(HozoPressable, { ...props, style }, (state: { pressed: boolean }) =>
    createElement(
      LabelScope,
      { resolve: hozoTextStyle, own: style },
      typeof children === 'function' ? children(state) : children,
    ),
  )
}

export const referenceNativeImports = (native: Record<string, unknown>) => ({
  ...native,
  Text: ReferenceText,
  View: ReferenceView,
})
