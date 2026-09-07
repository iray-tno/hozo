import { type ReactNode, useEffect, useRef } from 'react'
import { shouldRestoreFocus } from './focus-scope.tsx'

export interface DialogProps {
  /** Whether the dialog is showing. Render is driven by this, not by mounting. */
  open?: boolean
  /**
   * Called when the browser asks for the dialog to close -- Escape, or the
   * form's own dismiss.
   */
  onClose?: () => void
  /** The dialog's accessible name. */
  accessibilityLabel?: string
  accessibilityHint?: string
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

export function Dialog({
  open = false,
  onClose,
  accessibilityLabel,
  accessibilityHint,
  className,
  testID,
  children,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement | null>(null)
  const opener = useRef<Element | null>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return

    if (open && !dialog.open) {
      opener.current = document.activeElement
      dialog.showModal()
      return
    }
    if (!open && dialog.open) {
      dialog.close()
      const previous = opener.current
      if (
        previous instanceof HTMLElement &&
        shouldRestoreFocus({
          focusable: previous.isConnected && !previous.hasAttribute('disabled'),
        })
      ) {
        previous.focus()
      }
      opener.current = null
    }
  }, [open])

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

  return (
    <dialog
      ref={ref}
      className={className}
      aria-label={accessibilityLabel}
      aria-description={accessibilityHint}
      data-testid={testID}
    >
      {children}
    </dialog>
  )
}

export { Dialog as HozoDialog, type DialogProps as HozoDialogProps }
