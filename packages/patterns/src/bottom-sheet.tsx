import { DismissableLayer, FocusScope, Portal } from '@hozo/behaviors'
import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  clampToDetents,
  cycleDetent,
  fractionAfter,
  nextDetent,
  normalizeDetents,
  restingFraction,
  travelFor,
} from './sheet-rules.ts'

export interface HozoBottomSheetProps {
  /** Whether the sheet is showing. The caller owns this, as with `Dialog`. */
  open?: boolean
  /** Called when the sheet asks to go away: Escape, the scrim, or a drag down. */
  onClose?: () => void
  /** The sheet's accessible name. */
  accessibilityLabel?: string
  /** An id inside the sheet that names it, when the name is already on screen. */
  accessibilityLabelledBy?: string
  /**
   * The resting heights, as fractions of the sheet that are showing.
   *
   * `[1]` by default, which is a sheet with one position and nothing to resize.
   * `[0.5, 1]` is the familiar half-then-full sheet. See `sheet-rules.ts` for
   * what a release does with them.
   */
  detents?: readonly number[]
  /** Which detent it opens at. The largest by default. */
  defaultDetent?: number
  /** The fraction below which a release dismisses. Half the lowest detent by default. */
  dismissBelow?: number
  /**
   * The name of the drag handle, when there is more than one detent and it is
   * therefore a button. Defaults to "Resize".
   */
  handleAccessibilityLabel?: string
  /**
   * Whether the sheet is rendered into the portal host.
   *
   * True in practice; false is for tests, which is the same reason `Tooltip`
   * has it -- `Portal` renders nothing until it has mounted, so a server render
   * of a portalled sheet is an empty string and there is no markup to assert.
   */
  portal?: boolean
  className?: string
  scrimClassName?: string
  sheetClassName?: string
  handleClassName?: string
  testID?: string
  children?: ReactNode
}

/**
 * A modal sheet that comes up from the bottom edge and can be dragged away.
 *
 * `BottomSheet = Portal + FocusScope + DismissableLayer + a gesture`, which is
 * #142's equation, and the gesture is the part that is not a Behaviour: #156
 * records that press and pan are delegated to React Native's responder system
 * rather than owned as a Layer 2 primitive. So the arithmetic goes in
 * `sheet-rules.ts` where both platforms import it, and each half writes the
 * gesture in the vocabulary its platform has -- pointer events here, a
 * `PanResponder` there. The same split `Slider` already uses.
 *
 * ## Modal, unlike `Popover`, and not by preference
 *
 * A sheet has a scrim. Something that dims the page has already said the page
 * is not available, so `aria-modal` and the Tab trap are what a reader needs to
 * be told the same thing -- the opposite end of the argument `Popover` records
 * for defaulting to non-modal, and the same rule: the two travel together.
 *
 * ## Three boxes, and two wrappers that are not boxes
 *
 * `Dialog` is one element, because a real `<dialog>` brings the trap, the scrim
 * as `::backdrop` and the stacking with it. Nothing here does, so the root, the
 * scrim and the panel are all written out -- but `DismissableLayer` and
 * `FocusScope` each need a DOM node of their own to hang a listener and a scope
 * on, and neither should be in the layout. Both get `display: contents`, which
 * keeps DOM containment -- what the outside-press check and the focus query both
 * actually use -- while leaving the panel a direct child of the root's flex box.
 * Otherwise the panel's width would resolve against two anonymous wrappers.
 *
 * ## The transform is a percentage, which is why nothing is measured to render
 *
 * `translateY` in per cent resolves against the element's own height, so
 * "showing half of itself" is `translateY(50%)` without anyone knowing how tall
 * the sheet is. The height is measured once per gesture instead, on the way
 * down, because turning a finger's travel in pixels into a fraction is the only
 * thing that actually needs it.
 */
export function HozoBottomSheet({
  open = false,
  onClose,
  accessibilityLabel,
  accessibilityLabelledBy,
  detents,
  defaultDetent,
  dismissBelow,
  handleAccessibilityLabel = 'Resize',
  portal = true,
  className,
  scrimClassName,
  sheetClassName,
  handleClassName,
  testID,
  children,
}: HozoBottomSheetProps) {
  const stops = normalizeDetents(detents)
  const largest = stops[stops.length - 1] as number
  const openAt = clampToDetents(defaultDetent ?? largest, stops)

  const panelRef = useRef<HTMLDivElement>(null)
  const [fraction, setFraction] = useState(openAt)
  const [dragging, setDragging] = useState(false)
  // The gesture's own state, in a ref because a pointer move must not wait for
  // a render to know where the last one was.
  const gesture = useRef({
    startY: 0,
    startFraction: 1,
    height: 0,
    lastY: 0,
    lastAt: 0,
    velocity: 0,
  })

  // Reopening starts where the caller said, not where the last drag left it.
  useEffect(() => {
    if (open) setFraction(openAt)
  }, [open, openAt])

  const resizable = stops.length > 1

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const height = panelRef.current?.getBoundingClientRect().height ?? 0
      if (height <= 0) return
      event.currentTarget.setPointerCapture(event.pointerId)
      gesture.current = {
        startY: event.clientY,
        startFraction: fraction,
        height,
        lastY: event.clientY,
        lastAt: event.timeStamp,
        velocity: 0,
      }
      setDragging(true)
    },
    [fraction],
  )

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (!dragging) return
      const at = gesture.current
      const travel = travelFor(at.startFraction, at.height) + (event.clientY - at.startY)
      // `timeStamp` can repeat for coalesced moves, so the divisor is floored at
      // one millisecond -- a zero there would make the velocity infinite and the
      // projection would dismiss on a stationary finger.
      const elapsed = Math.max(1, event.timeStamp - at.lastAt)
      at.velocity = (event.clientY - at.lastY) / elapsed
      at.lastY = event.clientY
      at.lastAt = event.timeStamp
      setFraction(clampToDetents(fractionAfter(travel, at.height), stops))
    },
    [dragging, stops],
  )

  const onPointerUp = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (!dragging) return
      setDragging(false)
      event.currentTarget.releasePointerCapture(event.pointerId)
      const at = gesture.current
      const landed = restingFraction({
        fraction,
        velocity: at.velocity,
        height: at.height,
        detents: stops,
        dismissBelow,
      })
      if (landed === null) {
        onClose?.()
        return
      }
      setFraction(landed)
    },
    [dismissBelow, dragging, fraction, onClose, stops],
  )

  const onHandleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const direction = event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : null
    if (direction === null) return
    const next = nextDetent(fraction, stops, direction)
    // Nothing above the top and nothing below the bottom, and the key goes back
    // to the page rather than being swallowed.
    if (next === null) return
    event.preventDefault()
    setFraction(next)
  }

  if (!open) return null

  /**
   * The handle, which is a control only when there is something to resize.
   *
   * With one detent the only gesture is drag-to-dismiss, and the single-pointer
   * alternative WCAG 2.5.7 asks for already exists -- pressing the scrim, or
   * Escape. So the handle is decoration a reader is not shown.
   *
   * With several, dragging becomes the only way to change the size, so the
   * handle has to be pressable: a press cycles to the next detent and the arrows
   * step through them. It is named for the people that requirement is about --
   * pointer users who cannot drag, and magnifier users, for whom the size is
   * plainly perceivable. A screen reader hears the whole sheet at any detent, so
   * this is the one control here whose effect is visual only, and it is offered
   * rather than hidden because 2.5.7 is about the pointer.
   */
  const handle = resizable ? (
    <button
      type="button"
      aria-label={handleAccessibilityLabel}
      className={handleClassName}
      // Touch scrolling would otherwise take the gesture before the first move
      // arrives. Inline because it is what makes the drag work, not how it looks.
      style={{ touchAction: 'none' }}
      onClick={() => {
        const next = cycleDetent(fraction, stops)
        if (next !== null) setFraction(next)
      }}
      onKeyDown={onHandleKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    />
  ) : (
    <div
      aria-hidden="true"
      className={handleClassName}
      style={{ touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    />
  )

  return (
    <Portal disabled={!portal}>
      <div className={className} data-hozo-state="open">
        {/*
          The scrim is its own element and is hidden from the accessibility tree:
          `aria-modal` has already told a reader the page is unavailable, and a
          second unnamed region saying so is noise. It has no press handler
          either -- `DismissableLayer` sees a press outside the sheet, and the
          scrim is outside it.
        */}
        <div aria-hidden="true" className={scrimClassName} />
        <DismissableLayer onDismiss={onClose} style={{ display: 'contents' }}>
          <FocusScope trapped autoFocus restoreFocus style={{ display: 'contents' }}>
            <div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label={accessibilityLabelledBy ? undefined : accessibilityLabel}
              aria-labelledby={accessibilityLabelledBy}
              data-hozo-state="open"
              data-hozo-dragging={dragging ? 'true' : undefined}
              data-testid={testID}
              className={sheetClassName}
              style={{ transform: `translateY(${(1 - fraction) * 100}%)` }}
            >
              {handle}
              {children}
            </div>
          </FocusScope>
        </DismissableLayer>
      </div>
    </Portal>
  )
}

export { HozoBottomSheet as BottomSheet, type HozoBottomSheetProps as BottomSheetProps }
