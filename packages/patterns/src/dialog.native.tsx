import { shouldRestoreFocus } from '@hozo/behaviors'
import { type ComponentRef, type ReactNode, type RefObject, useEffect, useRef } from 'react'
import {
  AccessibilityInfo,
  AppState,
  findNodeHandle,
  Modal,
  type StyleProp,
  View,
  type ViewStyle,
} from 'react-native'

/** Moves accessibility focus to a view, reporting whether it could. */
type FocusMover = (view: ComponentRef<typeof View>) => boolean

/**
 * The native module's focus move, or a function that admits it cannot.
 *
 * The same seam `@hozo/engine`'s `safe-area.native.ts` uses, and for the same
 * reason: an optional package is resolved once at module load, so the choice is
 * made before anything renders and never inside a branch afterwards.
 *
 * What differs is the fallback's quality. Safe areas fall back to zeros, which
 * is a wrong answer. This falls back to `sendAccessibilityEvent`, which is what
 * shipped before `@hozo/native` existed.
 *
 * `require` inside `try`, deliberately, rather than a static import: the point
 * is to work when the package is not installed, and a static import of a
 * missing package is a resolution error before any of this runs. It does resolve
 * on a device -- `@hozo/engine` has done the same since safe areas shipped, and
 * #493 confirmed it reaches the module from inside a Metro bundle.
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

/**
 * One restore attempt: the native action if the package is there, the event if
 * it is not.
 *
 * TEMPORARY, the announcement. It says which attempt ran and which mechanism it
 * used, through the channel `talkback-speech.json` already records, because the
 * seam is otherwise silent and a failed restore looks identical to a restore
 * that was never attempted. It comes out together with the `HozoA11y` logging in
 * `@hozo/native` once #484 is settled.
 */
function attemptRestore(opener: ComponentRef<typeof View>, when: 'now' | 'window'): void {
  const native = when === 'now' && moveFocusNatively(opener)
  AccessibilityInfo.announceForAccessibility(
    `hozo probe: ${when} ${native ? 'native' : 'fallback'}`,
  )
  if (native) return
  // `sendAccessibilityEvent` rather than `setAccessibilityFocus`, which is
  // deprecated in 0.87 in favour of it and takes a tag where this takes the
  // host instance.
  AccessibilityInfo.sendAccessibilityEvent(opener, 'focus')
}

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
  // Set by a dismissal that wants focus back, and cleared by the window coming
  // back. It keeps the listener to our own dismissals: the window also returns
  // from a notification shade or a task switch, and moving focus then would take
  // it from wherever the user actually was.
  const awaitingWindow = useRef(false)

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

    // Armed after the guard, not before it: a dismissal with nothing to restore
    // to must not leave the listener waiting for the next unrelated window.
    awaitingWindow.current = true

    // Asked now as well as later, and both are needed.
    //
    // Now, because iOS has no second window and lands every time, and because
    // Android does not always send the window event -- one dismissal in five in
    // the #484 sweep never got it. Without this, those dismissals would be worse
    // than what shipped before.
    //
    // Later, because now is too early on Android whatever mechanism is used. The
    // sweep measured an event being dropped until 175-200ms after the window came
    // back, and #493 then measured `ACTION_ACCESSIBILITY_FOCUS` returning `true`
    // on the right view at this moment -- twice, on two independent runs -- with
    // focus still not moving. The action is not a stronger lever at the wrong
    // time; it is the same lever.
    attemptRestore(opener, 'now')
  }, [open, restoreFocusTo])

  /**
   * Asks again when the window comes back, which is when Android will listen.
   *
   * `AppState`'s `focus` carries Android's `onWindowFocusChanged(true)` -- the
   * activity's window becoming focusable again -- so it arrives once the modal's
   * window is out of the way. A signal rather than a number, which is the whole
   * reason for preferring it: the 175-200ms threshold the sweep found is a
   * property of that emulator, and nothing says it holds on a loaded device.
   *
   * No platform branch. `focus` and `blur` are documented Android-only and
   * nothing emits them on iOS, so the listener is inert there rather than wrong
   * -- and a `Platform.OS` check would make this path untestable, since the stub
   * reports `ios`.
   */
  useEffect(() => {
    const subscription = AppState.addEventListener('focus', () => {
      if (!awaitingWindow.current) return
      awaitingWindow.current = false
      const opener = restoreFocusTo?.current
      // Gone with its screen: a dialog can close because the whole route is
      // unmounting, and the button went with it.
      if (!opener || findNodeHandle(opener) === null) return
      attemptRestore(opener, 'window')
    })
    return () => {
      subscription.remove()
    }
  }, [restoreFocusTo])

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
