import React, {
  type ComponentRef,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { type StyleProp, View, type ViewStyle } from 'react-native'
import {
  type ComputePositionOptions,
  computePosition,
  type PositionResult,
} from './floating-geometry.ts'

/**
 * What React Native hands back for a `<View>`, rather than a shape of our
 * own that happens to have `measureInWindow` on it.
 *
 * The hand-rolled one could not be passed to a `<View ref>` -- this file
 * did exactly that, and the erasure around it hid the mismatch.
 */
type MeasurableRef = RefObject<ComponentRef<typeof View> | null>

export interface UseFloatingPositionOptions extends ComputePositionOptions {
  anchorRef: MeasurableRef
  floatingRef: MeasurableRef
  enabled?: boolean
}

/**
 * Universal React hook for floating element positioning on React Native.
 */
export function useFloatingPosition({
  anchorRef,
  floatingRef,
  enabled = true,
  placement = 'bottom',
  offset = 8,
  crossAxisOffset = 0,
  flip = true,
  shift = true,
  viewportPadding = 8,
  arrowPadding = 4,
}: UseFloatingPositionOptions): PositionResult | null {
  const [position, setPosition] = useState<PositionResult | null>(null)

  const update = useCallback(() => {
    if (!enabled) return
    const anchor = anchorRef.current
    if (!anchor?.measureInWindow) return

    anchor.measureInWindow((ax, ay, aw, ah) => {
      const floating = floatingRef.current
      if (floating?.measureInWindow) {
        floating.measureInWindow((_fx, _fy, fw, fh) => {
          // Assume standard device screen dimensions fallback
          const viewport = { width: 400, height: 800 }
          const result = computePosition(
            { x: ax, y: ay, width: aw, height: ah },
            { x: 0, y: 0, width: fw, height: fh },
            viewport,
            {
              placement,
              offset,
              crossAxisOffset,
              flip,
              shift,
              viewportPadding,
              arrowPadding,
            },
          )
          setPosition(result)
        })
      }
    })
  }, [
    enabled,
    anchorRef,
    floatingRef,
    placement,
    offset,
    crossAxisOffset,
    flip,
    shift,
    viewportPadding,
    arrowPadding,
  ])

  useEffect(() => {
    if (!enabled) return
    update()
  }, [enabled, update])

  return position
}

export interface FloatingPositionerProps extends ComputePositionOptions {
  children?: ReactNode | ((position: PositionResult | null) => ReactNode)
  anchorRef: MeasurableRef
  style?: StyleProp<ViewStyle>
}

/**
 * Universal `<FloatingPositioner>` component for React Native.
 */
export function FloatingPositioner({
  children,
  anchorRef,
  style,
  ...options
}: FloatingPositionerProps) {
  const floatingRef = useRef<ComponentRef<typeof View> | null>(null)

  const position = useFloatingPosition({
    anchorRef,
    floatingRef,
    ...options,
  })

  const positionStyles = position
    ? {
        position: 'absolute' as const,
        left: position.x,
        top: position.y,
        width: options.matchAnchorWidth ? position.anchorWidth : undefined,
        opacity: position.referenceHidden ? 0 : 1,
      }
    : {
        position: 'absolute' as const,
        left: -9999,
        top: -9999,
        opacity: 0,
      }

  return React.createElement(
    View,
    {
      ref: floatingRef,
      style: [positionStyles, style],
    },
    typeof children === 'function' ? children(position) : children,
  )
}
