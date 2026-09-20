import { shouldRestoreFocus } from '@hozo/behaviors'
import { type ComponentRef, type ReactNode, type RefObject, useEffect, useRef } from 'react'
import {
  AccessibilityInfo,
  findNodeHandle,
  Modal,
  type StyleProp,
  View,
  type ViewStyle,
} from 'react-native'

/** Moves accessibility focus to a view, reporting whether it could. */
type FocusMover = (view: object) => boolean

/**
 * The native module's focus move, or a function that admits it cannot.
 *
 * The same seam `@hozo/engine`'s `safe-area.native.ts` uses, and for the same
 * reason: an optional package is resolved once at module load, so the choice
 * is made before anything renders and never inside a branch afterwards.
 *
 * What differs is the fallback's quality. Safe areas fall back to zeros, which
 * is a wrong answer. This falls back to `sendAccessibilityEvent`, which is what
 * shipped before `@hozo/native` existed and restores focus roughly half the
 * time on Android. Absence is a degradation here, not a break.
 *
 * `require` inside `try`, deliberately, rather than a static import: the point
 * is to work when the package is not installed, and a static import of a
 * missing package is a resolution error before any of this runs.
 */
function resolveFocusMover(): FocusMover {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const module = require('@hozo/native') as { moveAccessibilityFocus?: FocusMover }
    if (typeof module.moveAccessibilityFocus === 'function') return module.moveAccessibilityFocus
  } catch {
    // Not installed, or no `require` in this environment. Either way the
    // fallback below is the behaviour every caller had before.
  }
  return () => false
}

const moveFocusNatively = resolveFocusMover()

export interface DialogProps {
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
  open?: boolean
  onClose?: () => void
  accessibilityLabel?: string
  accessibilityHint?: string
  /**
   * The control to put accessibility focus back on when the dialog closes.
   *
   * Asked for rather than found, which is the difference between the two
   * platforms. The Web half reads `document.activeElement` when the dialog
   * opens and needs nothing from the caller; React Native has no equivalent
   * -- nothing can be asked what holds accessibility focus -- so the opener
   * has to be handed over.
   *
   * Without it TalkBack lands wherever Android's traversal order puts it once
   * the modal closes. On the acceptance screen that was the email field above
   * the button that had opened the dialog (#462).
   */
  restoreFocusTo?: RefObject<ComponentRef<typeof View> | null> | null
  style?: unknown
  /**
   * Dropped until a device said so.
   *
   * The Web half carries `testID` into `data-testid` like every other
   * universal prop. This one did not have it in the type at all, so
   * `<Dialog testID>` compiled and vanished -- and the emulator's
   * accessibility tree showed the dialog identified by nothing but its
   * label, which is what found it (#297).
   */
  testID?: string
  children?: ReactNode
}

export function Dialog({
  open = false,
  onClose,
  accessibilityLabel,
  accessibilityHint,
  restoreFocusTo,
  style,
  testID,
  children,
}: DialogProps) {
  // The previous value of `open`, because the restore belongs to the
  // transition and not to the state: an effect that only sees `open === false`
  // also fires on the first render, when nothing was opened and nothing
  // should move.
  const wasOpen = useRef(false)

  useEffect(() => {
    const closing = wasOpen.current && !open
    wasOpen.current = open
    if (!closing) return

    const opener = restoreFocusTo?.current
    if (!opener) return

    // Resolved to a tag only to ask whether the view is still there: a ref to
    // an unmounted one gives `null`, which is the native shape of the question
    // `shouldRestoreFocus` answers on both platforms.
    if (!shouldRestoreFocus({ focusable: findNodeHandle(opener) !== null })) return

    // The native action first, because it is the only one that works.
    //
    // #484 measured what the JavaScript route can do here. Every path from
    // `sendAccessibilityEvent` ends at `View.sendAccessibilityEvent` with
    // `TYPE_VIEW_FOCUSED` -- an event announcing that focus moved, not an
    // instruction to move it. On Android a closing `Modal` leaves a window
    // whose accessibility state has not caught up, and an event sent into that
    // gap is dropped: a delay sweep put the boundary between 175 and 200ms on
    // one emulator, reproduced twelve rounds out of twelve. A number measured
    // on one machine is not a fix, so `@hozo/native` performs
    // `ACTION_ACCESSIBILITY_FOCUS` instead, which is the action.
    if (moveFocusNatively(opener)) return

    // Without that package, what shipped before it. Right about half the time
    // on Android, and right every time on iOS, where this reaches
    // `UIAccessibility` and there is no second window in the way.
    //
    // `sendAccessibilityEvent` rather than `setAccessibilityFocus`, which is
    // deprecated in 0.87 in favour of it and takes a tag where this takes the
    // host instance.
    AccessibilityInfo.sendAccessibilityEvent(opener, 'focus')
  }, [open, restoreFocusTo])

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={style as StyleProp<ViewStyle>}
        accessible
        accessibilityViewIsModal
        accessibilityRole="none"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        testID={testID}
      >
        {children}
      </View>
    </Modal>
  )
}

export { Dialog as HozoDialog, type DialogProps as HozoDialogProps }
