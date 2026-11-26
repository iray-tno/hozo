// Opt-in layout measurement on React Native for `%`-mixed CSS math
// expressions whose percentages cannot be expressed statically in Yoga:
//
// 1. `HozoSelfMeasured`: measures the host's own border-box `{ width, height }`
//    for self-sized properties (`translate*`, `rounded*`, `gap*`).
// 2. `HozoMeasuredParent` + `HozoParentSizeQuery`: measures a same-component
//    parent host's border-box via `onLayout`, derives content-box, padding-box,
//    and main-axis sizes from its flattened style, and publishes them to direct
//    children using `%`-mixed `calc()` / `min()` / `max()` / `clamp()`.
//
// Like `HozoContainer`, both components render the existing host directly with
// no extra wrapper View, forward the author's own `onLayout`, and settle Yoga
// sub-pixel float wobble via `keepIfSettled`.

import {
  type ComponentPropsWithRef,
  createContext,
  type ElementType,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from 'react'
import {
  type LayoutChangeEvent,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native'

import { keepIfSettled } from './runtime-measured.ts'

export interface HozoBoxSize {
  readonly width: number
  readonly height: number
}

/**
 * Derived containing-block dimensions published by `HozoMeasuredParent`.
 *
 * - `width` / `height`: content-box (`borderBox - border - padding`), matching
 *   CSS `%` rules for `width`, `height`, `margin*`, `padding*`, and `space-*`.
 * - `paddingBoxWidth` / `paddingBoxHeight`: padding-box (`borderBox - border`),
 *   matching CSS `%` rules for `position: 'absolute'` insets.
 * - `mainAxisSize`: `width` when the parent's resolved `flexDirection` is
 *   `'row'` or `'row-reverse'`, otherwise `height` (React Native's default
 *   column main axis), matching CSS `%` rules for `flex-basis`.
 */
export interface HozoParentSize {
  readonly width: number
  readonly height: number
  readonly paddingBoxWidth: number
  readonly paddingBoxHeight: number
  readonly mainAxisSize: number
}

const HozoParentSizeContext = createContext<HozoParentSize | undefined>(undefined)

const RESTING_INTERACTION = {
  pressed: false,
  hovered: false,
  focused: false,
  focusVisible: false,
} as const

function finitePx(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

interface ParentBoxInsets {
  readonly padStart: number
  readonly padEnd: number
  readonly padTop: number
  readonly padBottom: number
  readonly borderStart: number
  readonly borderEnd: number
  readonly borderTop: number
  readonly borderBottom: number
  readonly isRow: boolean
}

function readParentBoxInsets(style: unknown): ParentBoxInsets {
  const candidate = typeof style === 'function' ? style(RESTING_INTERACTION) : style
  const flat = (StyleSheet.flatten(candidate as StyleProp<ViewStyle>) ?? {}) as Record<
    string,
    unknown
  >
  const padAll = finitePx(flat.padding)
  const padH = finitePx(flat.paddingInline) ?? finitePx(flat.paddingHorizontal) ?? padAll
  const padV = finitePx(flat.paddingBlock) ?? finitePx(flat.paddingVertical) ?? padAll
  const padStart =
    finitePx(flat.paddingInlineStart) ??
    finitePx(flat.paddingStart) ??
    finitePx(flat.paddingLeft) ??
    padH ??
    0
  const padEnd =
    finitePx(flat.paddingInlineEnd) ??
    finitePx(flat.paddingEnd) ??
    finitePx(flat.paddingRight) ??
    padH ??
    0
  const padTop = finitePx(flat.paddingBlockStart) ?? finitePx(flat.paddingTop) ?? padV ?? 0
  const padBottom = finitePx(flat.paddingBlockEnd) ?? finitePx(flat.paddingBottom) ?? padV ?? 0

  const borderAll = finitePx(flat.borderWidth)
  const borderStart =
    finitePx(flat.borderStartWidth) ?? finitePx(flat.borderLeftWidth) ?? borderAll ?? 0
  const borderEnd =
    finitePx(flat.borderEndWidth) ?? finitePx(flat.borderRightWidth) ?? borderAll ?? 0
  const borderTop = finitePx(flat.borderTopWidth) ?? borderAll ?? 0
  const borderBottom = finitePx(flat.borderBottomWidth) ?? borderAll ?? 0

  const isRow = flat.flexDirection === 'row' || flat.flexDirection === 'row-reverse'
  return {
    padStart,
    padEnd,
    padTop,
    padBottom,
    borderStart,
    borderEnd,
    borderTop,
    borderBottom,
    isRow,
  }
}

export type HozoSelfMeasuredProps<Host extends ElementType = typeof View> =
  ComponentPropsWithRef<Host> & {
    /** Compiler-selected host: measurement must not replace a Pressable/Text with a View. */
    hozoMeasuredComponent?: Host
    /** Evaluates self-sized CSS math styles once `onLayout` has reported `{ width, height }`. */
    hozoSelfStyle: (size: HozoBoxSize) => StyleProp<ViewStyle>
  }

/**
 * Measures the host element's own border-box `{ width, height }` via `onLayout`
 * without inserting a wrapper View, and appends the evaluated style once
 * measured.
 */
export function HozoSelfMeasured<Host extends ElementType = typeof View>({
  hozoMeasuredComponent,
  hozoSelfStyle,
  onLayout,
  style,
  children,
  ...rest
}: HozoSelfMeasuredProps<Host>): ReactNode {
  const Component: ElementType = hozoMeasuredComponent ?? View
  const [size, setSize] = useState<HozoBoxSize | undefined>(undefined)

  const measure = (event: LayoutChangeEvent) => {
    const measuredW = event.nativeEvent.layout.width
    const measuredH = event.nativeEvent.layout.height
    if (
      typeof measuredW === 'number' &&
      Number.isFinite(measuredW) &&
      typeof measuredH === 'number' &&
      Number.isFinite(measuredH)
    ) {
      setSize((current) => {
        const nextW = keepIfSettled(current?.width, measuredW)
        const nextH = keepIfSettled(current?.height, measuredH)
        if (current && nextW === current.width && nextH === current.height) return current
        return { width: nextW, height: nextH }
      })
    }
    onLayout?.(event)
  }

  const extra = size ? hozoSelfStyle(size) : undefined
  const resolvedStyle =
    extra === undefined
      ? style
      : typeof style === 'function'
        ? (state: unknown) => [style(state), extra]
        : style !== undefined
          ? [style, extra]
          : extra

  return (
    <Component {...rest} style={resolvedStyle} onLayout={measure}>
      {children}
    </Component>
  )
}

export type HozoMeasuredParentProps<Host extends ElementType = typeof View> =
  ComponentPropsWithRef<Host> & {
    /** Compiler-selected host; distinct from `hozoMeasuredComponent` and `hozoContainerComponent` so all three compose. */
    hozoParentComponent?: Host
  }

/**
 * Measures a parent host's layout box via `onLayout` without adding a wrapper
 * View, subtracts its resolved border and padding insets from `style`, and
 * provides `HozoParentSize` to direct children via `HozoParentSizeQuery`.
 */
export function HozoMeasuredParent<Host extends ElementType = typeof View>({
  hozoParentComponent,
  onLayout,
  style,
  children,
  ...rest
}: HozoMeasuredParentProps<Host>): ReactNode {
  const Component: ElementType = hozoParentComponent ?? View
  const [borderBox, setBorderBox] = useState<HozoBoxSize | undefined>(undefined)
  const insets = readParentBoxInsets(style)

  const measure = (event: LayoutChangeEvent) => {
    const measuredW = event.nativeEvent.layout.width
    const measuredH = event.nativeEvent.layout.height
    if (
      typeof measuredW === 'number' &&
      Number.isFinite(measuredW) &&
      typeof measuredH === 'number' &&
      Number.isFinite(measuredH)
    ) {
      setBorderBox((current) => {
        const nextW = keepIfSettled(current?.width, measuredW)
        const nextH = keepIfSettled(current?.height, measuredH)
        if (current && nextW === current.width && nextH === current.height) return current
        return { width: nextW, height: nextH }
      })
    }
    onLayout?.(event)
  }

  const parentSize = useMemo<HozoParentSize | undefined>(() => {
    if (!borderBox) return undefined
    const paddingBoxWidth = Math.max(0, borderBox.width - insets.borderStart - insets.borderEnd)
    const paddingBoxHeight = Math.max(0, borderBox.height - insets.borderTop - insets.borderBottom)
    const width = Math.max(0, paddingBoxWidth - insets.padStart - insets.padEnd)
    const height = Math.max(0, paddingBoxHeight - insets.padTop - insets.padBottom)
    return {
      width,
      height,
      paddingBoxWidth,
      paddingBoxHeight,
      mainAxisSize: insets.isRow ? width : height,
    }
  }, [
    borderBox,
    insets.borderStart,
    insets.borderEnd,
    insets.borderTop,
    insets.borderBottom,
    insets.padStart,
    insets.padEnd,
    insets.padTop,
    insets.padBottom,
    insets.isRow,
  ])

  return (
    <HozoParentSizeContext.Provider value={parentSize}>
      <Component {...rest} style={style} onLayout={measure}>
        {children}
      </Component>
    </HozoParentSizeContext.Provider>
  )
}

/**
 * Reads the enclosing same-component `HozoMeasuredParent`'s derived sizes
 * through a render prop (no extra layout node) so children in the same function
 * component can consume the context provided by their parent element.
 */
export function HozoParentSizeQuery({
  children,
}: {
  children: (parent: HozoParentSize | undefined) => ReactNode
}): ReactNode {
  return children(useContext(HozoParentSizeContext))
}
