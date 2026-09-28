/**
 * A slider on React Native. See `slider.tsx` for the shape and the arithmetic,
 * which is shared: both halves import `slider-rules.ts`, so a drag lands in
 * the same place on both platforms.
 *
 * The gesture is a `PanResponder` rather than pointer events, because that is
 * what this platform has. It does the job `setPointerCapture` does on the Web
 * -- once the responder is granted, every move goes to it until the touch
 * ends, wherever the finger has got to -- so the two are the same guarantee
 * written twice rather than two different behaviours.
 *
 * The track measures itself with `onLayout` instead of reading a box on each
 * move. There is no synchronous way to ask a view for its size here, and the
 * layout event is what the platform offers; a resize fires it again.
 *
 * `accessibilityRole="adjustable"` is the platform's word for a slider, and
 * `onAccessibilityAction` is the half people forget: with a screen reader on,
 * a swipe up or down on the thumb sends `increment` or `decrement` rather
 * than a pan, and a slider that only listens to the pan is one a reader
 * cannot move at all.
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import {
  type LayoutChangeEvent,
  PanResponder,
  type StyleProp,
  View,
  type ViewStyle,
} from 'react-native'
import { fractionAt, fractionOf, movedBy, type SliderRange, snap, valueAt } from './slider-rules.ts'

export interface HozoSliderProps extends Partial<SliderRange> {
  value?: number
  defaultValue?: number
  onValueChange?: (value: number) => void
  onValueCommit?: (value: number) => void
  valueText?: (value: number) => string
  orientation?: 'horizontal' | 'vertical'
  disabled?: boolean
  accessibilityLabel?: string
  /**
   * Tailwind classes, the same props the Web half takes.
   *
   * On a tag the compiler lowers they are gone by runtime, replaced by a
   * `StyleSheet` entry. Anywhere else they are carried and ignored here --
   * this side has no CSS engine to resolve a class list against -- and the
   * types still have to accept them, because an app is type-checked against
   * the source the compiler reads rather than its output.
   */
  className?: string
  thumbClassName?: string
  fillClassName?: string
  style?: StyleProp<ViewStyle>
  thumbStyle?: StyleProp<ViewStyle>
  fillStyle?: StyleProp<ViewStyle>
}

export function HozoSlider({
  value,
  defaultValue,
  onValueChange,
  onValueCommit,
  valueText,
  min = 0,
  max = 100,
  step = 1,
  bigStep,
  orientation = 'horizontal',
  disabled,
  accessibilityLabel,
  style,
  thumbStyle,
  fillStyle,
}: HozoSliderProps) {
  const range: SliderRange = { min, max, step, bigStep }
  const vertical = orientation === 'vertical'
  const [uncontrolled, setUncontrolled] = useState(() => snap(defaultValue ?? min, range))
  const current = snap(value ?? uncontrolled, range)

  // Read inside the responder, which is created once and would otherwise
  // close over the first render's value forever.
  const live = useRef({ current, range, vertical, disabled, value, onValueChange, onValueCommit })
  live.current = { current, range, vertical, disabled, value, onValueChange, onValueCommit }

  const box = useRef({ left: 0, top: 0, width: 0, height: 0 })
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { x, y, width, height } = event.nativeEvent.layout
    box.current = { left: x, top: y, width, height }
  }, [])

  const change = useCallback((next: number) => {
    const at = live.current
    if (next === at.current) return
    if (at.value === undefined) setUncontrolled(next)
    at.onValueChange?.(next)
  }, [])

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => live.current.disabled !== true,
        onMoveShouldSetPanResponder: () => live.current.disabled !== true,
        onPanResponderGrant: (event) => {
          const { locationX, locationY } = event.nativeEvent
          const at = live.current
          change(
            valueAt(
              fractionAt({ x: locationX, y: locationY }, box.current, { vertical: at.vertical }),
              at.range,
            ),
          )
        },
        onPanResponderMove: (event) => {
          const { locationX, locationY } = event.nativeEvent
          const at = live.current
          change(
            valueAt(
              fractionAt({ x: locationX, y: locationY }, box.current, { vertical: at.vertical }),
              at.range,
            ),
          )
        },
        onPanResponderRelease: () => {
          live.current.onValueCommit?.(live.current.current)
        },
      }),
    [change],
  )

  const fraction = fractionOf(current, range)
  const step1 = (key: 'ArrowUp' | 'ArrowDown') => {
    const next = movedBy(key, { ...range, value: current, vertical })
    if (next === null) return
    change(next)
    onValueCommit?.(next)
  }

  return (
    <View style={style} onLayout={onLayout} {...responder.panHandlers}>
      {fillStyle === undefined ? null : (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            fillStyle,
            vertical ? { height: `${fraction * 100}%` } : { width: `${fraction * 100}%` },
          ]}
        />
      )}
      <View
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ min, max, now: current, text: valueText?.(current) }}
        accessibilityState={{ disabled }}
        // The half people forget. With a reader on, a swipe up or down sends
        // these instead of a pan, and a slider that only listens to the pan is
        // one a reader cannot move.
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) => {
          if (disabled) return
          if (event.nativeEvent.actionName === 'increment') step1('ArrowUp')
          if (event.nativeEvent.actionName === 'decrement') step1('ArrowDown')
        }}
        style={thumbStyle}
      />
    </View>
  )
}

export { HozoSlider as Slider, type HozoSliderProps as SliderProps }
