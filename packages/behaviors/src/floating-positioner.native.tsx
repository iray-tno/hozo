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
  toContainingBlock,
} from './floating-geometry.ts'

/** Where the positioner parks the panel until it has been measured once. */
const OFFSCREEN = -9999

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
 *
 * The result is in the coordinates of the floating element's parent, for its
 * `left`/`top`. That assumes the element sits at `left: -9999, top: -9999`
 * until the first result and at each result after, as `FloatingPositioner`
 * places it: the parent's origin is read back from where that put it.
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
  // Where the floating element was last placed, in its parent's coordinates:
  // what turns its window measurement back into the parent's origin.
  const placed = useRef({ x: OFFSCREEN, y: OFFSCREEN })

  const update = useCallback(() => {
    if (!enabled) return
    const anchor = anchorRef.current
    if (!anchor?.measureInWindow) return

    anchor.measureInWindow((ax, ay, aw, ah) => {
      const floating = floatingRef.current
      if (floating?.measureInWindow) {
        floating.measureInWindow((fx, fy, fw, fh) => {
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
          const local = toContainingBlock(result, { x: fx, y: fy }, placed.current)
          placed.current = { x: local.x, y: local.y }
          setPosition(local)
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
  /**
   * Tailwind classes, the same prop the Web half takes.
   *
   * On a tag the compiler lowers it is gone by runtime, replaced by a
   * `StyleSheet` entry. Anywhere else it is carried and ignored here --
   * this side has no CSS engine to resolve a class list against -- and
   * the type still has to accept it, because an app is type-checked
   * against the source the compiler reads rather than its output.
   */
  className?: string
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
        left: OFFSCREEN,
        top: OFFSCREEN,
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
