import { shouldRestoreFocus, usePresence } from '@hozo/behaviors'
import {
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
} from 'react'

export interface DialogProps {
  /** Whether the dialog is showing. Render is driven by this, not by mounting. */
  open?: boolean
  /**
   * Called when the browser asks for the dialog to close -- Escape, or the
   * form's own dismiss.
   */
  onClose?: () => void
  /**
   * Call `onClose` when the backdrop behind the panel is pressed (#1715).
   *
   * Off by default, as the browser's own `<dialog>` is: a press beside a form
   * that throws its contents away is the surprise. Escape and `onClose` are
   * still the way every user closes it; this is one more, for a pointer.
   */
  closeOnBackdropPress?: boolean
  /** The dialog's accessible name. */
  accessibilityLabel?: string
  /**
   * The id of an element inside that names it, usually its heading, so the
   * name is not written twice (#1715). `aria-labelledby` here, and it wins
   * over `accessibilityLabel`, as on `Popover`.
   */
  accessibilityLabelledBy?: string
  accessibilityHint?: string
  /**
   * The control to return focus to when the dialog closes, when it should not
   * be whatever had focus at the moment it opened.
   *
   * The native half cannot work this out for itself -- React Native has no
   * `document.activeElement` -- so it takes this prop and restores nothing
   * without it (#462). Here it is an override: given one it wins, left out
   * the element focused when the dialog opened is restored as before.
   */
  restoreFocusTo?: RefObject<HTMLElement | null> | null
  className?: string
  /**
   * The same prop the native half was missing, for the same reason it
   * mattered there: a caller writes it and expects to find the element.
   * Neither half had it, so the asymmetry was invisible until an
   * emulator's accessibility tree showed the dialog with no identifier
   * on it at all (#297).
   */
  testID?: string
  children?: ReactNode
}

/**
 * A modal dialog, the browser's own `<dialog>` opened with `showModal()`.
 *
 * ## Closing is the end of its exit, not the moment `open` turns false
 *
 * `close()` takes the element out of the top layer and the UA hides a
 * `dialog:not([open])`, so nothing can animate after it (#1715). So `open`
 * turning false first sets `data-state="closed"` and leaves the dialog shown,
 * and `close()` and the focus restore wait for the transition or animation that
 * state starts -- the presence `Popover` has, decision 007. With no exit in the
 * stylesheet, which is the default, it closes at once, as before.
 */
export function Dialog({
  open = false,
  onClose,
  closeOnBackdropPress = false,
  accessibilityLabel,
  accessibilityLabelledBy,
  accessibilityHint,
  restoreFocusTo,
  className,
  testID,
  children,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement | null>(null)
  const opener = useRef<Element | null>(null)
  const presence = usePresence(open)
  const shown = presence.mounted
  const restoreTo = useRef(restoreFocusTo)
  restoreTo.current = restoreFocusTo

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return

    if (open && !dialog.open) {
      opener.current = document.activeElement
      dialog.showModal()
      return
    }
    if (!shown && dialog.open) {
      dialog.close()
      restore(restoreTo.current?.current ?? opener.current)
      opener.current = null
    }
  }, [open, shown])

  // Unmounted while open, or while it is still animating out: the element
  // leaves the top layer with it, and focus goes back as a close would send it.
  // The element is read at mount: React has cleared the ref by the time this
  // cleanup runs.
  useEffect(() => {
    const dialog = ref.current
    return () => {
      if (dialog?.open) restore(restoreTo.current?.current ?? opener.current)
    }
  }, [])

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    const onCancel = (event: Event) => {
      event.preventDefault()
      onClose?.()
    }
    dialog.addEventListener('cancel', onCancel)
    return () => dialog.removeEventListener('cancel', onCancel)
  }, [onClose])

  /**
   * A press on `::backdrop` arrives as a click on the `<dialog>` itself, and
   * so does one on the panel's own padding. Only a point outside the panel's
   * box is the backdrop. A click from the keyboard has no point (`detail` 0)
   * and is never one.
   *
   * The press has to start there too. Selecting text in a field and letting
   * go past the panel's edge clicks the `<dialog>` outside its box, and that
   * is not a request to throw the form away.
   */
  const pressedBackdrop = useRef(false)
  const onBackdropPointerDown = (event: PointerEvent<HTMLDialogElement>) => {
    pressedBackdrop.current = onBackdrop(event)
  }
  const onBackdropClick = (event: MouseEvent<HTMLDialogElement>) => {
    const pressed = pressedBackdrop.current
    pressedBackdrop.current = false
    if (pressed && event.detail !== 0 && onBackdrop(event)) onClose?.()
  }
  const backdrop = closeOnBackdropPress && open

  const { ref: presenceRef } = presence
  const setRef = useCallback(
    (node: HTMLDialogElement | null) => {
      ref.current = node
      presenceRef(node)
    },
    [presenceRef],
  )

  return (
    <dialog
      ref={setRef}
      className={className}
      aria-label={accessibilityLabelledBy ? undefined : accessibilityLabel}
      aria-labelledby={accessibilityLabelledBy}
      aria-description={accessibilityHint}
      data-testid={testID}
      data-state={presence.state}
      onTransitionEnd={presence.onTransitionEnd}
      onAnimationEnd={presence.onAnimationEnd}
      onPointerDown={backdrop ? onBackdropPointerDown : undefined}
      onClick={backdrop ? onBackdropClick : undefined}
    >
      {children}
    </dialog>
  )
}

/** Whether a pointer event on the `<dialog>` landed outside the panel's box. */
function onBackdrop(event: MouseEvent<HTMLDialogElement>) {
  const dialog = event.currentTarget
  if (event.target !== dialog) return false
  const box = dialog.getBoundingClientRect()
  return (
    event.clientX < box.left ||
    event.clientX > box.right ||
    event.clientY < box.top ||
    event.clientY > box.bottom
  )
}

function restore(previous: Element | null) {
  if (
    previous instanceof HTMLElement &&
    shouldRestoreFocus({
      focusable: previous.isConnected && !previous.hasAttribute('disabled'),
    })
  ) {
    previous.focus()
  }
}

export { Dialog as HozoDialog, type DialogProps as HozoDialogProps }
