import { hozoTextChildren, useHozoMessage } from '@hozo/behaviors'
import { useDrag1D } from '@hozo/behaviors/native'
import { hozoClasses } from '@hozo/engine/project'
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type LayoutChangeEvent, Modal, type StyleProp, View, type ViewStyle } from 'react-native'
import { Pressable } from './pressable.native.tsx'
import {
  clampToDetents,
  cycleDetent,
  fractionAfter,
  normalizeDetents,
  restingFraction,
  travelFor,
} from './sheet-rules.ts'
import { splitTextStyle } from './text-style.native.ts'

export interface HozoBottomSheetProps {
  open?: boolean
  onClose?: () => void
  accessibilityLabel?: string
  accessibilityLabelledBy?: string
  detents?: readonly number[]
  defaultDetent?: number
  dismissBelow?: number
  handleAccessibilityLabel?: string
  portal?: boolean
  /**
   * Tailwind classes, the same props the Web half takes.
   *
   * On a tag the compiler lowers they are gone by runtime, replaced by a
   * `StyleSheet` entry. Here they arrive as strings and are resolved through
   * the project's candidate map (#886), a pressable handle or scrim with its
   * interaction state. Each `*Style` prop comes after its class list.
   */
  className?: string
  scrimClassName?: string
  sheetClassName?: string
  handleClassName?: string
  style?: StyleProp<ViewStyle>
  scrimStyle?: StyleProp<ViewStyle>
  sheetStyle?: StyleProp<ViewStyle>
  handleStyle?: StyleProp<ViewStyle>
  testID?: string
  children?: ReactNode
}

/**
 * A modal sheet that comes up from the bottom edge, on React Native.
 *
 * The same equation as the Web half with two of its parts renamed: `Modal` is
 * `Portal` and the trap at once. `useDrag1D` owns the responder lifecycle, and
 * `sheet-rules.ts` decides which detent a flick lands on. Native's `vy` is
 * already pixels per millisecond, positive downward, so its release projection
 * needs no conversion.
 *
 * ## This is where a sheet is a first-class citizen, and the back button proves it
 *
 * `Popover` on this platform has no answer for Android's back button, because it
 * is not a `Modal` and nothing else receives that event. A sheet *is* a modal, so
 * `onRequestClose` is the back button, and the platform's own dismissal works
 * without anything being invented. That asymmetry is the reason #142 lists
 * `BottomSheet` separately instead of making it a prop on `Popover`.
 *
 * ## `escape`, which is the rotor's dismiss
 *
 * VoiceOver's two-finger scrub and TalkBack's back gesture arrive as the
 * `escape` accessibility action. Answering it is what makes the sheet dismissible
 * by someone who cannot perform a swipe-down drag, and it is the row #142's
 * Verification Matrix asks a human to confirm.
 *
 * ## Height is measured here, unlike on the Web
 *
 * The Web half slides by a percentage, which resolves against the element's own
 * height and needs no measurement. React Native transforms take pixels, so the
 * panel reports its height through `onLayout` and the first frame of a sheet
 * whose default detent is not its largest shows it fully open. One frame, and
 * only for a sheet that opens part-way.
 */
export function HozoBottomSheet({
  open = false,
  onClose,
  accessibilityLabel,
  detents,
  defaultDetent,
  dismissBelow,
  handleAccessibilityLabel: handleAccessibilityLabelProp,
  className,
  scrimClassName,
  sheetClassName,
  handleClassName,
  style,
  scrimStyle,
  sheetStyle,
  handleStyle,
  testID,
  children,
}: HozoBottomSheetProps) {
  // A string from the prop, then the project's i18n, then English;
  // `locale` the same way (decision 008).
  const message = useHozoMessage()
  const handleAccessibilityLabel = message(
    'hozo.bottomSheet.handle',
    {},
    handleAccessibilityLabelProp,
  )
  const stops = useMemo(() => normalizeDetents(detents), [detents])
  const largest = stops[stops.length - 1] as number
  const openAt = clampToDetents(defaultDetent ?? largest, stops)

  const [fraction, setFraction] = useState(openAt)
  const [height, setHeight] = useState(0)

  useEffect(() => {
    if (open) setFraction(openAt)
  }, [open, openAt])

  /** Where the sheet was when the finger went down, so a pan is relative to it. */
  const start = useRef({ fraction: openAt, height: 0 })
  const drag = useDrag1D({
    axis: 'y',
    disabled: !open || height <= 0,
    nativeActivationDistance: 2,
    onStart() {
      start.current = { fraction, height }
    },
    onMove(delta) {
      const at = start.current
      const travel = travelFor(at.fraction, at.height) + delta
      setFraction(clampToDetents(fractionAfter(travel, at.height), stops))
    },
    onEnd(delta, { velocity }) {
      const at = start.current
      const travel = travelFor(at.fraction, at.height) + delta
      const landed = restingFraction({
        fraction: clampToDetents(fractionAfter(travel, at.height), stops),
        velocity,
        extent: at.height,
        detents: stops,
        dismissBelow,
      })
      if (landed === null) onClose?.()
      else setFraction(landed)
    },
    onCancel() {
      setFraction(start.current.fraction)
    },
  })

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setHeight(event.nativeEvent.layout.height)
  }, [])

  const resizable = stops.length > 1

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[hozoClasses(className), style]}>
        {/*
          The scrim is the tap that dismisses, which is the single-pointer
          alternative to dragging the sheet away. Hidden from the accessibility
          tree because `accessibilityViewIsModal` has already said the screen
          behind is unavailable, and a full-screen unnamed button saying it again
          is something a reader has to walk past.
        */}
        <Pressable
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={(interaction) => [hozoClasses(scrimClassName, { ...interaction }), scrimStyle]}
          onPress={onClose}
        />
        <View
          accessibilityViewIsModal
          accessibilityRole="none"
          // Carried for the platform to use as the modal's name. Whether it is
          // spoken on entry is a screen reader's decision and a Verification
          // Matrix row, not something this file can assert.
          accessibilityLabel={accessibilityLabel}
          accessibilityActions={[{ name: 'escape' }]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'escape') onClose?.()
          }}
          testID={testID}
          onLayout={onLayout}
          style={[
            hozoClasses(sheetClassName),
            sheetStyle,
            { transform: [{ translateY: travelFor(fraction, height) }] },
          ]}
        >
          {resizable ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={handleAccessibilityLabel}
              style={(interaction) => [
                hozoClasses(handleClassName, { ...interaction }),
                handleStyle,
              ]}
              onPress={() => {
                const next = cycleDetent(fraction, stops)
                if (next !== null) setFraction(next)
              }}
              {...drag.handlers}
            />
          ) : (
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={[hozoClasses(handleClassName), handleStyle]}
              {...drag.handlers}
            />
          )}
          {hozoTextChildren(children, splitTextStyle([hozoClasses(sheetClassName), sheetStyle])[1])}
        </View>
      </View>
    </Modal>
  )
}

export { HozoBottomSheet as BottomSheet, type HozoBottomSheetProps as BottomSheetProps }
