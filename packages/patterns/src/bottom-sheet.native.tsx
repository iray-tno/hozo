import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  type LayoutChangeEvent,
  Modal,
  PanResponder,
  Pressable,
  type StyleProp,
  View,
  type ViewStyle,
} from 'react-native'
import {
  clampToDetents,
  cycleDetent,
  fractionAfter,
  normalizeDetents,
  restingFraction,
  travelFor,
} from './sheet-rules.ts'

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
   * `StyleSheet` entry. Anywhere else they are carried and ignored here -- this
   * side has no CSS engine to resolve a class list against -- and the types
   * still have to accept them, because an app is type-checked against the source
   * the compiler reads rather than its output.
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
 * `Portal` and the trap at once, and the gesture is a `PanResponder` rather than
 * pointer events. The arithmetic is the same module, so the two cannot disagree
 * about which detent a flick lands on -- the split `Slider` already uses, and the
 * reason `gestureState.vy` needs no conversion is that it is already pixels per
 * millisecond, positive downward, which is what `sheet-rules.ts` asks for.
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
  handleAccessibilityLabel = 'Resize',
  style,
  scrimStyle,
  sheetStyle,
  handleStyle,
  testID,
  children,
}: HozoBottomSheetProps) {
  const stops = useMemo(() => normalizeDetents(detents), [detents])
  const largest = stops[stops.length - 1] as number
  const openAt = clampToDetents(defaultDetent ?? largest, stops)

  const [fraction, setFraction] = useState(openAt)
  const [height, setHeight] = useState(0)

  useEffect(() => {
    if (open) setFraction(openAt)
  }, [open, openAt])

  // What the responder callbacks read. They are created once, so they cannot
  // close over this render's values -- the same `live` ref `slider.native.tsx`
  // keeps, and for the same reason.
  const live = useRef({ fraction, height, stops, dismissBelow, onClose })
  live.current = { fraction, height, stops, dismissBelow, onClose }

  /** Where the sheet was when the finger went down, so a pan is relative to it. */
  const start = useRef(openAt)

  const pan = useMemo(
    () =>
      PanResponder.create({
        // False, so a tap reaches the handle's own press. The pan takes over
        // once the finger has actually moved, which is the negotiation React
        // Native provides and the reason press and drag can share one node.
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_event, state) => Math.abs(state.dy) > 2,
        onPanResponderGrant: () => {
          start.current = live.current.fraction
        },
        onPanResponderMove: (_event, state) => {
          const at = live.current
          if (at.height <= 0) return
          const travel = travelFor(start.current, at.height) + state.dy
          setFraction(clampToDetents(fractionAfter(travel, at.height), at.stops))
        },
        onPanResponderRelease: (_event, state) => {
          const at = live.current
          const landed = restingFraction({
            fraction: at.fraction,
            velocity: state.vy,
            extent: at.height,
            detents: at.stops,
            dismissBelow: at.dismissBelow,
          })
          if (landed === null) {
            at.onClose?.()
            return
          }
          setFraction(landed)
        },
      }),
    [],
  )

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setHeight(event.nativeEvent.layout.height)
  }, [])

  const resizable = stops.length > 1

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={style}>
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
          style={scrimStyle}
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
          style={[sheetStyle, { transform: [{ translateY: travelFor(fraction, height) }] }]}
        >
          {resizable ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={handleAccessibilityLabel}
              style={handleStyle}
              onPress={() => {
                const next = cycleDetent(fraction, stops)
                if (next !== null) setFraction(next)
              }}
              {...pan.panHandlers}
            />
          ) : (
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={handleStyle}
              {...pan.panHandlers}
            />
          )}
          {children}
        </View>
      </View>
    </Modal>
  )
}

export { HozoBottomSheet as BottomSheet, type HozoBottomSheetProps as BottomSheetProps }
