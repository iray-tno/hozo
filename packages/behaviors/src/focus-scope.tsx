import { type CSSProperties, type ReactNode, useEffect, useRef } from 'react'

export interface FocusCandidate {
  autofocus?: boolean
  focusable?: boolean
}

/**
 * Resolves which candidate receives focus when the scope activates.
 * 1. Explicit autofocus control (if focusable)
 * 2. First focusable descendant
 * 3. null -> focuses the scope container itself
 */
export function initialFocusIndex(candidates: readonly FocusCandidate[]): number | null {
  const requested = candidates.findIndex((c) => c.autofocus && c.focusable)
  if (requested !== -1) return requested
  const first = candidates.findIndex((c) => c.focusable)
  return first === -1 ? null : first
}

/**
 * Checks whether focus can be safely restored to opener element.
 * Must be connected to DOM and not disabled to prevent focus dropping to document.body.
 */
export function shouldRestoreFocus(opener: FocusCandidate | null | undefined): boolean {
  return opener?.focusable === true
}

export interface FocusScopeProps {
  children?: ReactNode
  trapped?: boolean
  autoFocus?: boolean
  restoreFocus?: boolean
  className?: string
  style?: CSSProperties
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Universal `<FocusScope>` component for Web.
 * Traps Tab key navigation, moves initial focus, and safely restores focus on unmount.
 */
export function FocusScope({
  children,
  trapped = true,
  autoFocus = true,
  restoreFocus = true,
  className,
  style,
}: FocusScopeProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (typeof document === 'undefined') return

    // Capture the trigger element that opened this scope
    if (restoreFocus && document.activeElement instanceof HTMLElement) {
      openerRef.current = document.activeElement
    }

    const container = containerRef.current
    if (!container) return

    if (autoFocus) {
      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => el.offsetParent !== null || el.getClientRects().length > 0)

      const candidates: FocusCandidate[] = focusables.map((el) => ({
        autofocus: el.hasAttribute('autofocus'),
        focusable: !el.hasAttribute('disabled') && el.tabIndex !== -1,
      }))

      const targetIdx = initialFocusIndex(candidates)
      if (targetIdx !== null && focusables[targetIdx]) {
        focusables[targetIdx].focus()
      } else {
        // Fallback: focus container itself (tabIndex="-1") so screen readers announce dialog role/label
        container.focus()
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!trapped || event.key !== 'Tab') return

      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => el.offsetParent !== null || el.getClientRects().length > 0)

      if (focusables.length === 0) {
        event.preventDefault()
        container.focus()
        return
      }

      const first = focusables[0]
      const last = focusables[focusables.length - 1]

      if (event.shiftKey) {
        if (document.activeElement === first || document.activeElement === container) {
          event.preventDefault()
          last?.focus()
        }
      } else {
        if (document.activeElement === last) {
          event.preventDefault()
          first?.focus()
        }
      }
    }

    container.addEventListener('keydown', handleKeyDown)

    return () => {
      container.removeEventListener('keydown', handleKeyDown)
      if (restoreFocus) {
        const opener = openerRef.current
        if (
          opener &&
          shouldRestoreFocus({
            focusable: opener.isConnected && !opener.hasAttribute('disabled'),
          })
        ) {
          opener.focus()
        }
      }
    }
  }, [trapped, autoFocus, restoreFocus])

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      className={className}
      style={{ outline: 'none', ...style }}
    >
      {children}
    </div>
  )
}
