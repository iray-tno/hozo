// Opt-in self-layout measurement on React Native for `%`-mixed CSS math
// expressions whose percentages resolve against the element's own box
// (`translate*-[calc(...)]`, `rounded*-[calc(...)]`, `gap*-[calc(...)]`).
//
// Like `HozoContainer`, this renders the existing host directly (`as` /
// `hozoMeasuredComponent`) with no extra wrapper View, forwards the author's
// own `onLayout`, and settles float noise via `keepIfSettled`.

import { type ComponentPropsWithRef, type ElementType, type ReactNode, useState } from 'react'
import { type LayoutChangeEvent, type StyleProp, View, type ViewStyle } from 'react-native'

import { keepIfSettled } from './runtime-measured.ts'

export interface HozoBoxSize {
  readonly width: number
  readonly height: number
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
