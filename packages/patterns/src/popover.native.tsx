import { FloatingPositioner, type Placement, Portal } from '@hozo/behaviors/native'
import { type ComponentRef, type ReactNode, useCallback, useRef, useState } from 'react'
import { Pressable, type StyleProp, View, type ViewStyle } from 'react-native'

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
      {open ? (
        <Portal>
          <FloatingPositioner
            anchorRef={anchorRef}
            placement={placement}
            offset={offset}
            flip
            shift
          >
            <View
              accessibilityViewIsModal={modal}
              accessibilityRole={modal ? 'none' : undefined}
              accessibilityLabel={accessibilityLabel}
              style={panelStyle}
            >
              {children}
            </View>
          </FloatingPositioner>
        </Portal>
      ) : null}
    </View>
  )
}

export { HozoPopover as Popover, type HozoPopoverProps as PopoverProps }
