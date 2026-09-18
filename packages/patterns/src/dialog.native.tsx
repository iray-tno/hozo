import { shouldRestoreFocus } from '@hozo/behaviors'
import { type ComponentRef, type ReactNode, type RefObject, useEffect, useRef } from 'react'
import {
  AccessibilityInfo,
  findNodeHandle,
  InteractionManager,
  Modal,
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

    // `setAccessibilityFocus` takes a view tag and nothing else, so the ref
    // has to be resolved to one. A ref to an unmounted view resolves to
    // `null`, which is the native shape of the question `shouldRestoreFocus`
    // answers on both platforms: restore only to something still there.
    const handle = findNodeHandle(opener)
    if (!shouldRestoreFocus({ focusable: handle !== null })) {
      AccessibilityInfo.announceForAccessibility('hozo probe: opener not focusable')
      return
    }
    AccessibilityInfo.announceForAccessibility('hozo probe: requesting focus')
    AccessibilityInfo.setAccessibilityFocus(handle as number)

    // And again once the dismissal has finished, because the first request
    // does not always survive it.
    //
    // The probe in #484 caught both halves of this. Every run asks -- the
    // marker above appears whether the run passes or fails -- and the failing
    // ones announce the window and then the field above the opener straight
    // afterwards, which is the `Modal` going away and accessibility focus
    // being re-seeded by traversal order. So the call is not missing; it is
    // being overtaken.
    //
    // Asked twice rather than moved: the synchronous call already works about
    // half the time, and a request that only ran after the animation would
    // give that up to fix the other half. `runAfterInteractions` is React
    // Native's "once the animations are done" hook, which is exactly the race
    // being lost.
    const retry = InteractionManager.runAfterInteractions(() => {
      // The opener can go away between the two: a dialog closing because the
      // screen it sat on is unmounting takes the button with it, and a stale
      // tag would point at nothing.
      if (findNodeHandle(opener) === null) return
      AccessibilityInfo.announceForAccessibility('hozo probe: requesting focus again')
      AccessibilityInfo.setAccessibilityFocus(handle as number)
    })
    return () => retry.cancel()
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
