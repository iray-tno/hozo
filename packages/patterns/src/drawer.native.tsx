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
import { clampToDetents, fractionAfter, restingFraction, travelFor } from './sheet-rules.ts'

export type HozoDrawerSide = 'left' | 'right'

export interface HozoDrawerProps {
  open?: boolean
  onClose?: () => void
  accessibilityLabel?: string
  accessibilityLabelledBy?: string
  side?: HozoDrawerSide
  portal?: boolean
  /**
   * Tailwind classes, the same props the Web half takes.
   *
   * On a tag the compiler lowers they are gone by runtime, replaced by a
   * `StyleSheet` entry. Anywhere else they are carried and ignored here -- this
   * side has no CSS engine to resolve a class list against -- and the types still
   * have to accept them, because an app is type-checked against the source the
   * compiler reads rather than its output.
   */
  className?: string
  scrimClassName?: string
  panelClassName?: string
  style?: StyleProp<ViewStyle>
  scrimStyle?: StyleProp<ViewStyle>
  panelStyle?: StyleProp<ViewStyle>
  testID?: string
  children?: ReactNode
}

/**
 * A modal panel that slides in from the left or right edge, on React Native.
 *
 * This is the half #142 puts the gesture on, and the only half that has one: the
 * Web drawer is asked for "off-canvas sliding nav, focus trapping, scroll lock"
 * and nothing about dragging. The split is not arbitrary. A drawer has no
 * grabber, so a swipe has to drag the panel's own body -- which fights text
 * selection on a desktop and fights nothing at all here, where there is also no
 * Escape key to fall back on.
 *
 * ## The same arithmetic on a different axis, which is what `extent` is for
 *
 * `sheet-rules.ts` is written in terms of "fraction showing", "travel away from
 * open" and "velocity away from open", and knows nothing about which direction
 * away is. So a left-hand drawer negates the horizontal axis and a right-hand one
 * does not, and the module that decides when a flick becomes a dismissal is the
 * one `BottomSheet` already uses. One detent, because a drawer is open or gone --
 * there is no half-open nav.
 *
 * ## No edge swipe to open, deliberately
 *
 * #142 lists one. A closed drawer cannot listen at the screen's edge without
 * keeping an invisible catcher over the application's content the whole time it
 * is closed, which is a decision about the screen rather than about the drawer,
 * and it collides with the platform's own back gestures. It also cannot be the
 * only way in -- nobody who cannot swipe could reach it -- so a trigger exists
 * regardless and this would sit on top of one. `open` is a prop, as with
 * `Dialog`.
 *
 * ## Android's back button works, because this is a `Modal`
 *
 * `onRequestClose` is that button, which is the same thing `BottomSheet` gets and
 * `Popover` cannot. The `escape` accessibility action answers VoiceOver's
 * two-finger scrub, so someone who cannot swipe the panel away still has the
 * platform's own dismissal.
 */
export function HozoDrawer({
  open = false,
  onClose,
  accessibilityLabel,
  side = 'left',
  style,
  scrimStyle,
  panelStyle,
  testID,
  children,
}: HozoDrawerProps) {
  const [fraction, setFraction] = useState(1)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    if (open) setFraction(1)
  }, [open])

  /**
   * Which way is "away".
   *
   * A left-hand drawer leaves to the left, so a negative `dx` is travel and a
   * negative `vx` is speed toward dismissal. A right-hand one is the identity.
   * This single number is the whole of the axis mapping, which is what keeps the
   * arithmetic shared with the bottom sheet.
   */
  const away = side === 'left' ? -1 : 1

  const live = useRef({ fraction, width, away, onClose })
  live.current = { fraction, width, away, onClose }

  /** Where the drawer was when the finger went down, so a pan is relative to it. */
  const start = useRef(1)

  const pan = useMemo(
    () =>
      PanResponder.create({
        // Only a move takes the responder, so a press on something inside the
        // drawer is still a press. The threshold is horizontal on purpose: a
        // vertical drag belongs to whatever list the drawer is holding.
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_event, state) =>
          Math.abs(state.dx) > 2 && Math.abs(state.dx) > Math.abs(state.dy),
        onPanResponderGrant: () => {
          start.current = live.current.fraction
        },
        onPanResponderMove: (_event, state) => {
          const at = live.current
          if (at.width <= 0) return
          const travel = travelFor(start.current, at.width) + at.away * state.dx
          setFraction(clampToDetents(fractionAfter(travel, at.width), [1]))
        },
        onPanResponderRelease: (_event, state) => {
          const at = live.current
          const landed = restingFraction({
            fraction: at.fraction,
            velocity: at.away * state.vx,
            extent: at.width,
            detents: [1],
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
    setWidth(event.nativeEvent.layout.width)
  }, [])

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={style}>
        {/*
          The scrim is the tap that dismisses, which is the alternative for anyone
          who cannot swipe the panel away. Hidden from the accessibility tree
          because `accessibilityViewIsModal` has already said the screen behind is
          unavailable.
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
          accessibilityLabel={accessibilityLabel}
          accessibilityActions={[{ name: 'escape' }]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'escape') onClose?.()
          }}
          testID={testID}
          onLayout={onLayout}
          style={[panelStyle, { transform: [{ translateX: away * travelFor(fraction, width) }] }]}
          {...pan.panHandlers}
        >
          {children}
        </View>
      </View>
    </Modal>
  )
}

export {
  HozoDrawer as Drawer,
  type HozoDrawerProps as DrawerProps,
  type HozoDrawerSide as DrawerSide,
}
