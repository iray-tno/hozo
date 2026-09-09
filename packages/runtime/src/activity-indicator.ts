import { type ComponentPropsWithoutRef, createElement, forwardRef } from 'react'

import { type HozoDomStyle, hozoDomStyle } from './dom-style.ts'

export interface HozoActivityIndicatorProps
  extends Omit<ComponentPropsWithoutRef<'span'>, 'color' | 'style'> {
  animating?: boolean
  color?: string | null
  hidesWhenStopped?: boolean
  size?: 'small' | 'large' | number
  style?: HozoDomStyle
}

const circle = (color: string | null, active: boolean) =>
  createElement('circle', {
    cx: 16,
    cy: 16,
    fill: 'none',
    opacity: active ? undefined : 0.2,
    r: 14,
    stroke: color ?? undefined,
    strokeDasharray: active ? 80 : undefined,
    strokeDashoffset: active ? 60 : undefined,
    strokeWidth: 4,
  })

/** React Native ActivityIndicator semantics without retaining React Native Web. */
export const HozoActivityIndicator = forwardRef<HTMLSpanElement, HozoActivityIndicatorProps>(
  function HozoActivityIndicator(
    {
      animating = true,
      color = '#1976D2',
      hidesWhenStopped = true,
      size = 'small',
      style,
      ...props
    },
    ref,
  ) {
    const pixels = typeof size === 'number' ? size : size === 'large' ? 36 : 20
    return createElement(
      'span',
      {
        ...props,
        'aria-valuemax': 1,
        'aria-valuemin': 0,
        ref,
        role: 'progressbar',
        style: hozoDomStyle([
          { alignItems: 'center', display: 'inline-flex', justifyContent: 'center' },
          style,
        ]),
      },
      createElement(
        'svg',
        {
          'aria-hidden': true,
          height: pixels,
          style: {
            animationDuration: '0.75s',
            animationIterationCount: 'infinite',
            animationName: 'hozo-activity-indicator-spin',
            animationPlayState: animating ? 'running' : 'paused',
            animationTimingFunction: 'linear',
            visibility: !animating && hidesWhenStopped ? 'hidden' : 'visible',
          },
          viewBox: '0 0 32 32',
          width: pixels,
        },
        circle(color, false),
        circle(color, true),
      ),
    )
  },
)
