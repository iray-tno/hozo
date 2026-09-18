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

/**
 * How long after the dismissal to ask for focus a second time.
 *
 * The delay `@hozo/behaviors`' `useAnnounce` uses to let assistive technology
 * notice a change, borrowed because it works there. Not derived from how long
 * a fade takes, and worth moving if the runs say it lands too early.
 */
const RESTORE_RETRY_MS = 50

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
    // half the time, and a request that only ran later would give that up to
    // fix the other half.
    //
    // A timer, and not the two things that look more principled.
    // `InteractionManager.runAfterInteractions` was React Native's "once the
    // animations are done" hook and is the obvious fit, but 0.87 removed it
    // from core -- reaching for it throws, and the core's own advice points at
    // `requestIdleCallback`, which promises idle time rather than a finished
    // dismissal. `requestAnimationFrame` is worse: `packages/primitives`
    // records it failing here twice, because a frame callback waits on the
    // compositor producing frames and under a headless time budget it never
    // ran at all.
    //
    // So: the delay `@hozo/behaviors`' `useAnnounce` already uses to let
    // assistive technology notice a change. Chosen because it works there
    // rather than from any theory about how long a fade takes, which is worth
    // being honest about -- if the distribution says it is too early, the
    // number is the thing to move.
    const retry = setTimeout(() => {
      // The opener can go away in between: a dialog closing because the screen
      // it sat on is unmounting takes the button with it, and a stale tag
      // would point at nothing.
      if (findNodeHandle(opener) === null) return
      AccessibilityInfo.announceForAccessibility('hozo probe: requesting focus again')
      AccessibilityInfo.setAccessibilityFocus(handle as number)
    }, RESTORE_RETRY_MS)
    return () => clearTimeout(retry)
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
