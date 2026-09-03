import React, {
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  type ComputePositionOptions,
  computePosition,
  type PositionResult,
} from './floating-geometry.ts'

export interface UseFloatingPositionOptions extends ComputePositionOptions {
  anchorRef: RefObject<{
    measureInWindow?: (
      callback: (x: number, y: number, width: number, height: number) => void,
    ) => void
  } | null>
  floatingRef: RefObject<{
    measureInWindow?: (
      callback: (x: number, y: number, width: number, height: number) => void,
    ) => void
  } | null>
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
  anchorRef: RefObject<{
    measureInWindow?: (
      callback: (x: number, y: number, width: number, height: number) => void,
    ) => void
  } | null>
  style?: Record<string, unknown> | unknown[]
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
  const floatingRef = useRef<{
    measureInWindow?: (
      callback: (x: number, y: number, width: number, height: number) => void,
    ) => void
  } | null>(null)

  const position = useFloatingPosition({
    anchorRef,
    floatingRef,
    ...options,
  })

  const positionStyles = position
    ? {
        position: 'absolute',
        left: position.x,
        top: position.y,
      }
    : {
        position: 'absolute',
        left: -9999,
        top: -9999,
        opacity: 0,
      }

  return React.createElement(
    'View',
    {
      ref: floatingRef,
      style: [positionStyles, style],
    },
    typeof children === 'function' ? children(position) : children,
  )
}
