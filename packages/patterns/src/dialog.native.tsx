import { shouldRestoreFocus } from '@hozo/behaviors'
import { moveAccessibilityFocus } from '@hozo/behaviors/native'
import { type ComponentRef, type ReactNode, type RefObject, useEffect, useRef } from 'react'
import {
  AppState,
  findNodeHandle,
  Modal,
  Platform,
  type StyleProp,
  View,
  type ViewStyle,
} from 'react-native'

// TalkBack acceptance sweeps on the reference emulator failed through 175ms
// after Android's window-focus signal and succeeded from 200ms. This is an
// empirical compatibility boundary, not a claim about TalkBack internals.
//
// TalkBack's own log later showed what the boundary is (#484): it drops a focus
// request until it considers the windows settled, which took 246 to 467 ms, and
// then restores focus from its own history. So this wait is on the edge, and
// loses whenever the windows settle late. `@hozo/native` keeps the wait and
// covers the loss: it watches where focus lands and asks again once.
const WINDOW_RESTORE_DELAY_MS = 250
// One measured dismissal emitted no window-focus signal. Keep a later fallback
// for that case; a real signal replaces it before it fires.
const CLOSE_RESTORE_FALLBACK_MS = 500

/**
 * The request this always sent, or `@hozo/native`'s request-and-check when the
 * application has registered it.
 *
 * Which of the two is running is decided once, in `accessibility-focus.native.ts`,
 * and is deliberately invisible here: a dialog with two code paths for this would
 * be a dialog where one of them is the one nobody measured.
 */
function attemptRestore(opener: ComponentRef<typeof View>): void {
  moveAccessibilityFocus(opener)
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
  const awaitingWindow = useRef(false)
  const restoreTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const closing = wasOpen.current && !open
    wasOpen.current = open
    if (open) {
      awaitingWindow.current = false
      if (restoreTimer.current !== null) {
        clearTimeout(restoreTimer.current)
        restoreTimer.current = null
      }
    }
    if (!closing) return

    const opener = restoreFocusTo?.current
    if (!opener) return

    const handle = findNodeHandle(opener)
    if (!shouldRestoreFocus({ focusable: handle !== null })) return

    // iOS has no second modal window-focus signal and restores on this edge.
    // Android must wait: sending here as well as after the window settles made
    // TalkBack announce the opener repeatedly when both requests landed.
    if (Platform.OS !== 'android') {
      attemptRestore(opener)
      return
    }

    awaitingWindow.current = true
    restoreTimer.current = setTimeout(() => {
      restoreTimer.current = null
      awaitingWindow.current = false
      const fallbackOpener = restoreFocusTo?.current
      if (wasOpen.current || !fallbackOpener || findNodeHandle(fallbackOpener) === null) return
      attemptRestore(fallbackOpener)
    }, CLOSE_RESTORE_FALLBACK_MS)
  }, [open, restoreFocusTo])

  useEffect(() => {
    const subscription = AppState.addEventListener('focus', () => {
      if (!awaitingWindow.current) return
      awaitingWindow.current = false
      if (restoreTimer.current !== null) clearTimeout(restoreTimer.current)
      restoreTimer.current = setTimeout(() => {
        restoreTimer.current = null
        const opener = restoreFocusTo?.current
        if (wasOpen.current || !opener || findNodeHandle(opener) === null) return
        attemptRestore(opener)
      }, WINDOW_RESTORE_DELAY_MS)
    })
    return () => {
      subscription.remove()
      if (restoreTimer.current !== null) {
        clearTimeout(restoreTimer.current)
        restoreTimer.current = null
      }
    }
  }, [restoreFocusTo])

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={style as StyleProp<ViewStyle>}
        // A dialog is a container, not one combined accessibility element.
        // On iOS an accessible parent hides its descendant controls from AX.
        // Keep modal isolation without swallowing confirm/cancel buttons.
        accessible={false}
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
