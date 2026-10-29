import { hozoAuthoredStyle } from '@hozo/engine/generated/gap-styles'
import { hozoClasses } from '@hozo/engine/project'

/**
 * A slider on React Native. See `slider.tsx` for the shape and the arithmetic,
 * which is shared: both halves import `slider-rules.ts`, so a drag lands in
 * the same place on both platforms.
 *
 * `useDrag1D` owns the responder lifecycle, coalesces moves and flushes the
 * release before committing. Slider owns the initial track-local position
 * and converts each logical delta back into that coordinate space.
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

import { useDrag1D } from '@hozo/behaviors/native'
import { usePressableInteraction } from '@hozo/behaviors/pressable-interaction'
import { useRef, useState } from 'react'
import {
  I18nManager,
  type LayoutChangeEvent,
  type StyleProp,
  View,
  type ViewStyle,
} from 'react-native'
import { fractionAt, fractionOf, type SliderRange, snap, valueAt } from './slider-rules.ts'
import type { SliderThumbSlotFacts } from './slot-facts.native.ts'

export type SliderThumbState = SliderThumbSlotFacts & { focused: boolean; focusVisible: boolean }

export interface HozoSliderProps extends Partial<SliderRange> {
  value?: number
  defaultValue?: number
  onValueChange?: (value: number) => void
  onValueCommit?: (value: number) => void
  onValueCancel?: () => void
  valueText?: (value: number) => string
  orientation?: 'horizontal' | 'vertical'
  disabled?: boolean
  accessibilityLabel?: string
  /**
   * Tailwind classes, the same props the Web half takes.
   *
   * On a tag the compiler lowers they are gone by runtime, replaced by a
   * `StyleSheet` entry. Here they arrive as strings and are resolved through
   * the project's candidate map (#886), the thumb with its own focus and
   * aria-disabled state. Like its Web div, it is not a disabled form control.
   * Each `*Style` prop comes after its class list, and a fill or a rail is
   * drawn when either of its pair is given.
   */
  className?: string
  thumbClassName?: string
  fillClassName?: string
  /** The rail the value runs along; see the Web half. */
  railClassName?: string
  style?: StyleProp<ViewStyle>
  thumbStyle?: StyleProp<ViewStyle>
  /** @internal Compiled classes, evaluated by the actual adjustable thumb. */
  hozoThumbStyle?: (state: SliderThumbState) => StyleProp<ViewStyle>
  fillStyle?: StyleProp<ViewStyle>
  railStyle?: StyleProp<ViewStyle>
}

export function HozoSlider({
  value,
  defaultValue,
  onValueChange,
  onValueCommit,
  onValueCancel,
  valueText,
  min = 0,
  max = 100,
  step = 1,
  bigStep,
  orientation = 'horizontal',
  disabled,
  accessibilityLabel,
  className,
  thumbClassName,
  fillClassName,
  railClassName,
  style,
  thumbStyle,
  hozoThumbStyle,
  fillStyle,
  railStyle,
}: HozoSliderProps) {
  // View's non-touch focus events belong to the adjustable thumb, not the
  // track that receives the pan. A non-touch focus ring needs no pointer
  // subscriptions, Pressable host or change to drag hit testing.
  const { state: interaction, handlers } = usePressableInteraction({
    focusVisible: 'keyboard-input',
  })
  const thumbFacts = {
    // aria-disabled is not a form-disabled host and does not imply blur.
    // Follow actual host events rather than inventing a lost focus fact.
    focused: interaction.focused,
    focusVisible: interaction.focusVisible,
    disabled: false,
    enabled: false,
    readOnly: true,
    'aria-disabled': Boolean(disabled),
    'aria-selected': false,
    'aria-checked': false,
  } satisfies SliderThumbState
  const range: SliderRange = { min, max, step, bigStep }
  const vertical = orientation === 'vertical'
  const [uncontrolled, setUncontrolled] = useState(() => snap(defaultValue ?? min, range))
  const current = snap(value ?? uncontrolled, range)

  const box = useRef({ left: 0, top: 0, width: 0, height: 0 })
  const gesture = useRef({ x: 0, y: 0, vertical, rtl: false, last: current })
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout
    // locationX/Y are relative to this track, not its parent. Parent offsets
    // from onLayout would shift every touch target inside a padded container.
    box.current = { left: 0, top: 0, width, height }
  }

  const change = (next: number) => {
    if (next === current) return
    if (value === undefined) setUncontrolled(next)
    onValueChange?.(next)
  }
  const move = (delta: number) => {
    const at = gesture.current
    if (box.current[at.vertical ? 'height' : 'width'] <= 0) return at.last
    const next = valueAt(
      fractionAt({ x: at.x + (at.rtl ? -delta : delta), y: at.y + delta }, box.current, at),
      range,
    )
    if (next !== at.last) {
      at.last = next
      change(next)
    }
    return next
  }
  const drag = useDrag1D({
    axis: vertical ? 'y' : 'x',
    disabled,
    canStart: () => box.current[vertical ? 'height' : 'width'] > 0,
    onStart() {
      move(0)
    },
    onMove: move,
    onEnd(delta) {
      const next = move(delta)
      onValueCommit?.(next)
    },
    onCancel: onValueCancel,
  })

  const fraction = fractionOf(current, range)
  const step1 = (direction: 1 | -1) => {
    const next = snap(current + direction * step, range)
    change(next)
    onValueCommit?.(next)
  }

  return (
    // Touches belong to the track, so locationX/Y cannot become thumb-local.
    <View
      accessible={false}
      pointerEvents="box-only"
      style={[hozoClasses(className), hozoAuthoredStyle(style)]}
      onLayout={onLayout}
      {...drag.handlers}
      onResponderGrant={(event) => {
        const { locationX, locationY } = event.nativeEvent
        gesture.current = {
          x: locationX,
          y: locationY,
          vertical,
          rtl: I18nManager.isRTL,
          last: current,
        }
        return drag.handlers.onResponderGrant?.(event)
      }}
    >
      {railStyle === undefined && railClassName === undefined ? null : (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[hozoClasses(railClassName), hozoAuthoredStyle(railStyle)]}
        />
      )}
      {fillStyle === undefined && fillClassName === undefined ? null : (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            hozoClasses(fillClassName),
            hozoAuthoredStyle(fillStyle),
            vertical ? { height: `${fraction * 100}%` } : { width: `${fraction * 100}%` },
          ]}
        />
      )}
      <View
        accessible
        focusable={!disabled}
        onFocus={handlers.focus}
        onBlur={handlers.blur}
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
          if (event.nativeEvent.actionName === 'increment') step1(1)
          if (event.nativeEvent.actionName === 'decrement') step1(-1)
        }}
        style={[
          hozoClasses(thumbClassName, thumbFacts),
          hozoThumbStyle?.(thumbFacts),
          hozoAuthoredStyle(thumbStyle),
          vertical ? { bottom: `${fraction * 100}%` } : { start: `${fraction * 100}%` },
        ]}
      />
    </View>
  )
}

export { HozoSlider as Slider, type HozoSliderProps as SliderProps }
