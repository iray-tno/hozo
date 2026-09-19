import { shouldRestoreFocus } from '@hozo/behaviors'
import { type ComponentRef, type ReactNode, type RefObject, useEffect, useRef } from 'react'
import {
  AccessibilityInfo,
  AppState,
  findNodeHandle,
  Modal,
  Platform,
  type StyleProp,
  View,
  type ViewStyle,
} from 'react-native'

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

/**
 * The delays the probe sweeps, in milliseconds. TEMPORARY, for #484.
 *
 * Not a hunt for a number that happens to work. `AppState`'s `focus` carries
 * Android's `onWindowFocusChanged(true)`, which says the activity's ordinary
 * window focus came back -- and that is managed separately from the
 * accessibility window state TalkBack reads, which `AccessibilityWindowManager`
 * updates when WindowManager notifies it that the window list changed. So the
 * signal is necessary but not sufficient, and the thing worth measuring is the
 * lag between the two.
 *
 * Bunched at the low end deliberately: a frame, two frames, then coarser. A
 * clean threshold supports the lag reading. Still failing at 500ms does not,
 * and would point instead at TalkBack ignoring `TYPE_VIEW_FOCUSED` according to
 * its own state -- which is what this sends, an event rather than
 * `ACTION_ACCESSIBILITY_FOCUS`: a notification, not a command.
 */
const PROBE_DELAYS = [0, 16, 32, 50, 100, 150, 200, 300, 500]
let probeAttempt = 0

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
  // Set by a dismissal that asked for focus back, and cleared by the window
  // coming back. Android refuses the request while the modal's own window is
  // still up, so the one that matters is sent from the listener below.
  const awaitingWindow = useRef(false)

  useEffect(() => {
    const closing = wasOpen.current && !open
    wasOpen.current = open
    if (!closing) return

    // TEMPORARY, AND NOT FOR MERGING. Investigation for #484.
    //
    // Focus returns to the opener about half the time; the other half TalkBack
    // lands on the email field above it, exactly as it did before #463. The
    // speech log says the opener is never announced on dismissal, so it is not
    // the harness mis-reading a phrase -- but `setAccessibilityFocus` returns
    // nothing, so "we asked and were overruled" and "we never asked" look
    // identical from outside.
    //
    // These markers go through TalkBack and land in `talkback-speech.json` in
    // order, beside the dialog's own utterances, which is the one channel that
    // is already recorded. Each exit gets its own, so a missing marker means
    // the effect did not run rather than that it bailed somewhere.
    //
    // It can still come up empty: `announceForAccessibility` is spoken by
    // TalkBack too, so a teardown that swallows the focus request may swallow
    // the marker with it. That outcome is informative as well, and would say
    // the next instrument has to sit below TalkBack.
    const opener = restoreFocusTo?.current
    if (!opener) {
      AccessibilityInfo.announceForAccessibility('hozo probe: no opener')
      return
    }
    // Resolved to a tag only to ask whether the view is still there: a ref to
    // an unmounted one gives `null`, which is the native shape of the question
    // `shouldRestoreFocus` answers on both platforms.
    if (!shouldRestoreFocus({ focusable: findNodeHandle(opener) !== null })) {
      AccessibilityInfo.announceForAccessibility('hozo probe: opener not focusable')
      return
    }
    // Armed after the guard, not before it. A dismissal that has nothing to
    // restore to must not leave the listener waiting: the window comes back
    // for its own reasons -- a notification shade, a task switch -- and the
    // next one would then aim a request at a view this code already decided
    // against.
    awaitingWindow.current = true
    // `sendAccessibilityEvent` rather than `setAccessibilityFocus`, which is
    // deprecated in 0.87 in favour of it and forwards to the legacy path. It
    // takes the host instance rather than a tag.
    //
    // Suppressed on Android for the sweep, which is the only way the sweep
    // measures anything. Of five rounds, four had this synchronous ask win and
    // the delayed one arrive irrelevant; a delay is observable only on a round
    // where this one was ignored, and that was one round in five. Nine delays
    // against one observation is not an experiment. With this gone on Android,
    // every round is the case under test.
    //
    // iOS keeps it, where it is the whole mechanism and lands every time.
    if (Platform.OS === 'android') {
      AccessibilityInfo.announceForAccessibility('hozo probe: deferring to window')
    } else {
      AccessibilityInfo.announceForAccessibility('hozo probe: requesting focus')
      AccessibilityInfo.sendAccessibilityEvent(opener, 'focus')
    }
  }, [open, restoreFocusTo])

  /**
   * Asks again when the window comes back, which is when Android will listen.
   *
   * On Android a `Modal` is a separate window, and it is still up through the
   * dismissal. Accessibility focus belongs to that window, so a request aimed
   * at a view in the one underneath is refused rather than lost. The probe in
   * #484 is what settled that: the failing runs ask twice, 50ms apart, and are
   * ignored both times, while the passing ones differ only in whether the
   * first ask happened to land after the window had gone.
   *
   * `AppState`'s `focus` is that moment. It carries Android's
   * `onWindowFocusChange(true)` -- the activity's window becoming focusable
   * again -- so it arrives once the modal's window is out of the way. A signal
   * rather than a guess, which is what both timer attempts were.
   *
   * No platform branch. `focus` and `blur` are documented Android-only, and on
   * iOS nothing emits `appStateFocusChange`, so the listener is inert there
   * rather than wrong -- and a `Platform.OS` check would have made this path
   * untestable, since the stub reports `ios`.
   *
   * `awaitingWindow` keeps it to our own dismissals. The window also returns
   * from a notification shade or a task switch, and moving focus then would
   * take it from wherever the user actually was.
   */
  useEffect(() => {
    let soon: ReturnType<typeof setTimeout> | undefined
    const subscription = AppState.addEventListener('focus', () => {
      if (!awaitingWindow.current) return
      awaitingWindow.current = false
      const opener = restoreFocusTo?.current
      // Gone with its screen: a dialog can close because the whole route is
      // unmounting, and the button went with it.
      if (!opener || findNodeHandle(opener) === null) return
      // A different delay every dismissal, so one boot measures the lag
      // instead of testing one guess at it. The marker carries the number, so
      // the speech log ties a delay to whether the opener was announced after
      // it.
      const delay = PROBE_DELAYS[probeAttempt % PROBE_DELAYS.length] ?? 0
      probeAttempt += 1
      soon = setTimeout(() => {
        AccessibilityInfo.announceForAccessibility(`hozo probe: asking ${delay}ms after window`)
        AccessibilityInfo.sendAccessibilityEvent(opener, 'focus')
      }, delay)
    })
    return () => {
      subscription.remove()
      if (soon !== undefined) clearTimeout(soon)
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
