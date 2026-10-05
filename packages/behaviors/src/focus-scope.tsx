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
  /**
   * Whether the scope holds focus. Turning it false does what unmounting
   * does -- the trap is released and focus goes back to the opener -- for
   * an overlay that stays mounted while it animates out (decision 007).
   * Focus left inside a panel that is fading away would be on something
   * nobody can use, and on nothing once the panel goes.
   */
  active?: boolean
  className?: string
  style?: CSSProperties
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * How long to keep trying to move focus in: ten tries a frame's length
 * apart. A container hidden until it is measured shows by the first or
 * second; ten is a bound, not a guess at a delay.
 */
const INITIAL_FOCUS_ATTEMPTS = 10
const INITIAL_FOCUS_INTERVAL_MS = 16

/**
 * Universal `<FocusScope>` component for Web.
 * Traps Tab key navigation, moves initial focus, and safely restores focus on unmount.
 */
export function FocusScope({
  children,
  trapped = true,
  autoFocus = true,
  restoreFocus = true,
  active = true,
  className,
  style,
}: FocusScopeProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (typeof document === 'undefined') return
    if (!active) return

    // Capture the trigger element that opened this scope
    if (restoreFocus && document.activeElement instanceof HTMLElement) {
      openerRef.current = document.activeElement
    }

    const container = containerRef.current
    if (!container) return

    // Where focus goes on the way in: the first candidate, or the container
    // itself (tabIndex="-1") so a screen reader still announces the role and
    // name.
    const initialTarget = (): HTMLElement => {
      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => el.offsetParent !== null || el.getClientRects().length > 0)

      const candidates: FocusCandidate[] = focusables.map((el) => ({
        autofocus: el.hasAttribute('autofocus'),
        focusable: !el.hasAttribute('disabled') && el.tabIndex !== -1,
      }))

      const targetIdx = initialFocusIndex(candidates)
      return (targetIdx !== null && focusables[targetIdx]) || container
    }

    // `focus()` on an element that cannot take focus yet does nothing, and
    // says nothing. `FloatingPositioner` is the case that found it: it draws
    // its content `visibility: hidden` until it has measured, in an effect
    // that runs after this one, so a popover's first focus landed on nothing
    // and stayed on the trigger. Trying again shortly after covers that and
    // any container like it -- but only while focus is still where the scope
    // found it, so a person who has moved on is not pulled back. A timer
    // rather than an animation frame: `focus()` resolves style itself, so it
    // needs the positioner to have rendered, not the page to have painted --
    // and frames do not run at all in a tab that is not being drawn.
    let retry: ReturnType<typeof setTimeout> | undefined
    const moveIn = (attempt: number) => {
      const target = initialTarget()
      target.focus()
      if (document.activeElement === target || attempt >= INITIAL_FOCUS_ATTEMPTS) return
      const stillWaiting =
        document.activeElement === openerRef.current ||
        document.activeElement === document.body ||
        document.activeElement === null
      if (!stillWaiting) return
      retry = setTimeout(() => moveIn(attempt + 1), INITIAL_FOCUS_INTERVAL_MS)
    }
    if (autoFocus) moveIn(0)

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
      clearTimeout(retry)
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
  }, [trapped, autoFocus, restoreFocus, active])

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
