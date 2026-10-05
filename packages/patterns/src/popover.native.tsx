import { FloatingPositioner, type Placement, Portal, usePresence } from '@hozo/behaviors/native'
import { type ComponentRef, type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { Animated, Easing, Pressable, type StyleProp, View, type ViewStyle } from 'react-native'

/**
 * How long the panel fades in and out, matching `@hozo/ui`'s Web panel
 * (`duration-150`), so the two platforms open at the same pace.
 *
 * A fade and nothing else, on both: it is not motion, so it stays under
 * reduced motion, which is the line decision 007 draws (WCAG 2.3.3 is about
 * movement). The Web half can be restyled; this one is built in, because a
 * Native pattern has no class list to say it with.
 */
const POPOVER_FADE_MS = 150

/** What React Native hands back for a `<View>`; see `tooltip.native.tsx`. */
export type NativeMeasurable = ComponentRef<typeof View>

export interface HozoPopoverProps {
  trigger: ReactNode
  children?: ReactNode
  accessibilityLabel?: string
  accessibilityLabelledBy?: string
  /**
   * Whether the rest of the screen is taken away while this is open.
   *
   * On Web this is `aria-modal` plus a Tab trap. Here it is
   * `accessibilityViewIsModal`, which is what tells VoiceOver and TalkBack to
   * stop offering everything behind the panel -- the same promise in the
   * vocabulary that has one. Both halves default to false for the reason the Web
   * half sets out at length: most popovers should leave the screen readable.
   */
  modal?: boolean
  placement?: Placement
  offset?: number
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  disabled?: boolean
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
  triggerClassName?: string
  panelClassName?: string
  style?: StyleProp<ViewStyle>
  triggerStyle?: StyleProp<ViewStyle>
  panelStyle?: StyleProp<ViewStyle>
}

/**
 * A rich popup anchored to the control that opens it, on React Native.
 *
 * The same composition as the Web half and two different words for two of its
 * three parts: `Portal` and `FloatingPositioner` are the native ones, and there
 * is no `FocusScope` because there is no Tab order to trap. What stands in for
 * it is `accessibilityViewIsModal`, which is the platform's way of saying the
 * same thing to a screen reader.
 *
 * ## No dismiss layer, and that is a platform difference rather than an omission
 *
 * `DismissableLayer` answers Escape and an outside press. There is no Escape key
 * on a phone, and an outside press needs a full-screen catcher -- which is a
 * modal by another name and would take the screen away from a reader even when
 * `modal` is false. So the panel is dismissed by pressing the trigger again, and
 * a caller who wants an outside press wraps the screen themselves.
 *
 * Android's back button is the case worth naming: it is the platform's Escape,
 * and `Modal` answers it. This is not a `Modal`, so it does not -- which is the
 * cost of an anchored panel here, and the reason `BottomSheet` in #142 is a
 * separate component rather than a prop on this one.
 */
export function HozoPopover({
  trigger,
  children,
  accessibilityLabel,
  modal = false,
  placement = 'bottom-start',
  offset = 4,
  defaultOpen = false,
  open: controlled,
  onOpenChange,
  disabled,
  style,
  triggerStyle,
  panelStyle,
}: HozoPopoverProps) {
  const anchorRef = useRef<NativeMeasurable | null>(null)
  const [uncontrolled, setUncontrolled] = useState(defaultOpen)
  const open = controlled ?? uncontrolled
  // Mounted while it fades out, so closing is not a cut on one platform and
  // a fade on the other.
  const presence = usePresence(open)
  const leaving = presence.mounted && !open
  const opacity = useRef(new Animated.Value(0)).current
  const { done } = presence
  useEffect(() => {
    if (!presence.mounted) return
    const fade = Animated.timing(opacity, {
      toValue: open ? 1 : 0,
      duration: POPOVER_FADE_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    })
    fade.start(({ finished }) => {
      if (finished && !open) done()
    })
    return () => fade.stop()
  }, [open, presence.mounted, opacity, done])

  const change = useCallback(
    (next: boolean) => {
      if (controlled === undefined) setUncontrolled(next)
      onOpenChange?.(next)
    },
    [controlled, onOpenChange],
  )

  return (
    <View style={style}>
      <Pressable
        ref={anchorRef}
        accessibilityRole="button"
        // `expanded` rather than a second label. The Web half says the same
        // thing with `aria-expanded`, and this is the prop React Native routes
        // into both platforms' node info.
        accessibilityState={{ expanded: open, disabled: Boolean(disabled) }}
        disabled={disabled}
        style={triggerStyle}
        onPress={() => change(!open)}
      >
        {trigger}
      </Pressable>
      {presence.mounted ? (
        <Portal>
          <FloatingPositioner
            anchorRef={anchorRef}
            placement={placement}
            offset={offset}
            flip
            shift
          >
            <Animated.View
              accessibilityViewIsModal={modal && !leaving}
              accessibilityRole={modal ? 'none' : undefined}
              accessibilityLabel={accessibilityLabel}
              // Leaving: still drawn, no longer there -- the Native words for
              // the Web half's `inert`.
              pointerEvents={leaving ? 'none' : 'auto'}
              accessibilityElementsHidden={leaving}
              importantForAccessibility={leaving ? 'no-hide-descendants' : 'auto'}
              style={[panelStyle, { opacity }]}
            >
              {children}
            </Animated.View>
          </FloatingPositioner>
        </Portal>
      ) : null}
    </View>
  )
}

export { HozoPopover as Popover, type HozoPopoverProps as PopoverProps }
