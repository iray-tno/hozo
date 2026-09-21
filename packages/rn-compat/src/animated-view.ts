import type { HozoDomStyle } from '@hozo/engine'
import { HozoView, type HozoViewProps } from '@hozo/primitives/generated/view'
import { createElement, type Ref, useEffect, useReducer } from 'react'
import { resolveAnimatedStyle, subscribeAnimatedStyle } from './animated-node.ts'

export interface HozoAnimatedViewProps extends Omit<HozoViewProps, 'style'> {
  style?: HozoDomStyle
  /** Declared here, because React 19 takes `ref` as an ordinary prop. */
  ref?: Ref<HTMLDivElement>
}

/** A DOM View that subscribes only when its style actually contains Animated nodes. */
export function HozoAnimatedView({ style, ref, ...props }: HozoAnimatedViewProps) {
  const [, redraw] = useReducer((version: number) => version + 1, 0)
  useEffect(() => subscribeAnimatedStyle(style, redraw), [style])

  return createElement(HozoView, {
    ...props,
    ref,
    style: resolveAnimatedStyle(style) as HozoDomStyle,
  })
}
