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

// TalkBack acceptance sweeps on the reference emulator failed through 175ms
// after Android's window-focus signal and succeeded from 200ms. This is an
// empirical compatibility boundary, not a claim about TalkBack internals.
const WINDOW_RESTORE_DELAY_MS = 250
// One measured dismissal emitted no window-focus signal. Keep a later fallback
// for that case; a real signal replaces it before it fires.
const CLOSE_RESTORE_FALLBACK_MS = 500

function attemptRestore(opener: ComponentRef<typeof View>): void {
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

    awaitingWindow.current = true
    attemptRestore(opener)
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
