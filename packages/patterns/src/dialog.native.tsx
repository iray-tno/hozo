import { DismissableLayer, shouldRestoreFocus } from '@hozo/behaviors'
import {
  type ComponentRef,
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  AccessibilityInfo,
  findNodeHandle,
  Modal,
  Platform,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native'

type FocusMover = (view: object) => boolean

function resolveFocusMover(): FocusMover {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const module = require('@hozo/native') as { moveAccessibilityFocus?: FocusMover }
    if (typeof module.moveAccessibilityFocus === 'function') return module.moveAccessibilityFocus
  } catch {
    // Optional package: retain React Native's event as the fallback.
  }
  return () => false
}

const moveFocusNatively = resolveFocusMover()

function attemptRestore(opener: ComponentRef<typeof View>): void {
  if (moveFocusNatively(opener)) return
  AccessibilityInfo.sendAccessibilityEvent(opener, 'focus')
}

type DialogHostMethods = {
  mount: (id: string, node: ReactNode) => void
  restoreAfterUnmount: (opener: ComponentRef<typeof View>) => void
  update: (id: string, node: ReactNode) => void
  unmount: (id: string) => void
}

const DialogHostContext = createContext<DialogHostMethods | null>(null)

export function DialogProvider({ children }: { children: ReactNode }) {
  const [dialogs, setDialogs] = useState<Map<string, ReactNode>>(() => new Map())
  const setDialog = useCallback((id: string, node: ReactNode) => {
    setDialogs((current) => {
      const next = new Map(current)
      next.set(id, node)
      return next
    })
  }, [])
  const unmount = useCallback((id: string) => {
    setDialogs((current) => {
      const next = new Map(current)
      next.delete(id)
      return next
    })
  }, [])
  const restoreAfterUnmount = useCallback((opener: ComponentRef<typeof View>) => {
    // Portal cleanup and the background accessibility update are React state
    // work. Queue the focus request after that commit instead of sending it
    // while the opener is still under no-hide-descendants.
    setTimeout(() => attemptRestore(opener), 0)
  }, [])
  const host = useMemo(
    () => ({ mount: setDialog, restoreAfterUnmount, update: setDialog, unmount }),
    [restoreAfterUnmount, setDialog, unmount],
  )
  const hasDialog = dialogs.size > 0

  return (
    <DialogHostContext.Provider value={host}>
      <View
        style={{ flex: 1 }}
        importantForAccessibility={hasDialog ? 'no-hide-descendants' : 'auto'}
      >
        {children}
      </View>
      {hasDialog ? (
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          {Array.from(dialogs.entries()).map(([id, dialog]) => (
            <View key={id} style={StyleSheet.absoluteFill} importantForAccessibility="yes">
              {dialog}
            </View>
          ))}
        </View>
      ) : null}
    </DialogHostContext.Provider>
  )
}

function HostedDialog({ open, children }: { open: boolean; children: ReactNode }) {
  const host = useContext(DialogHostContext)
  const id = useId()

  // `children` changes update the existing host entry in the next effect;
  // adding it here would unmount and remount the modal for every render.
  // biome-ignore lint/correctness/useExhaustiveDependencies: split mount/update lifecycle
  useEffect(() => {
    if (!open || !host) return
    host.mount(id, children)
    return () => host.unmount(id)
  }, [open, host, id])

  useEffect(() => {
    if (open && host) host.update(id, children)
  }, [open, host, id, children])

  if (!host) return open ? children : null
  return null
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
  const dialogRef = useRef<ComponentRef<typeof View> | null>(null)
  const dialogHost = useContext(DialogHostContext)

  useEffect(() => {
    const closing = wasOpen.current && !open
    wasOpen.current = open
    if (!closing) return

    const opener = restoreFocusTo?.current
    if (!opener) return

    const handle = findNodeHandle(opener)
    if (!shouldRestoreFocus({ focusable: handle !== null })) return

    if (Platform.OS === 'android' && dialogHost) {
      dialogHost.restoreAfterUnmount(opener)
      return
    }

    // iOS restores on the closing edge. An Android Dialog without a provider
    // also degrades to the immediate same-window request.
    attemptRestore(opener)
  }, [dialogHost, open, restoreFocusTo])

  useEffect(() => {
    if (!open || Platform.OS !== 'android') return
    const timer = setTimeout(() => {
      const dialog = dialogRef.current
      if (dialog) attemptRestore(dialog)
    }, 0)
    return () => clearTimeout(timer)
  }, [open])

  if (Platform.OS === 'android') {
    return (
      <HostedDialog open={open}>
        <DismissableLayer onDismiss={onClose} style={StyleSheet.absoluteFill as never}>
          <View
            ref={dialogRef}
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
        </DismissableLayer>
      </HostedDialog>
    )
  }

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
