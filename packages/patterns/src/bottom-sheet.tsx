import {
  DismissableLayer,
  FocusScope,
  Portal,
  useDrag1D,
  useHozoMessage,
  usePresence,
} from '@hozo/behaviors'
import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { useScrollLock } from './scroll-lock.ts'
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
 * #142's equation. `useDrag1D` owns capture, frame coalescing and cancellation
 * on each platform; `sheet-rules.ts` owns which detent a release lands on.
 * Keeping these separate lets a cancelled gesture restore its starting size
 * without treating cancellation as a request to dismiss.
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
  handleAccessibilityLabel: handleAccessibilityLabelProp,
  portal = true,
  className,
  scrimClassName,
  sheetClassName,
  handleClassName,
  testID,
  children,
}: HozoBottomSheetProps) {
  // A string from the prop, then the project's i18n, then English;
  // `locale` the same way (decision 008).
  const message = useHozoMessage()
  const handleAccessibilityLabel = message(
    'hozo.bottomSheet.handle',
    {},
    handleAccessibilityLabelProp,
  )
  const stops = normalizeDetents(detents)
  const largest = stops[stops.length - 1] as number
  const openAt = clampToDetents(defaultDetent ?? largest, stops)

  // The page behind a modal overlay should not scroll, and nothing but a real
  // `<dialog>` gets that for free. #142 asks for it under `Drawer`; the gap was
  // the same here, so the fix is the same module.
  useScrollLock(open)
  // The panel stays mounted while it animates out, as `data-state="closed"`
  // on the wrapper, the scrim and the panel (decision 007). The panel's
  // transition is the one waited for; with none it goes at once.
  const presence = usePresence(open)
  const leaving = presence.mounted && !open

  const panelRef = useRef<HTMLDivElement>(null)
  const [fraction, setFraction] = useState(openAt)
  // The gesture's own state, in a ref because a pointer move must not wait for
  // a render to know where the last one was.
  const gesture = useRef({
    startFraction: 1,
    height: 0,
  })
  const moved = useRef(false)

  // Reopening starts where the caller said, not where the last drag left it.
  useEffect(() => {
    if (open) setFraction(openAt)
  }, [open, openAt])

  const resizable = stops.length > 1

  const drag = useDrag1D({
    axis: 'y',
    disabled: !open,
    canStart() {
      const height = panelRef.current?.getBoundingClientRect().height ?? 0
      if (height <= 0) return false
      gesture.current = { startFraction: fraction, height }
      return true
    },
    onStart() {
      moved.current = false
    },
    onMove(delta) {
      const at = gesture.current
      if (Math.abs(delta) > 2) moved.current = true
      const travel = travelFor(at.startFraction, at.height) + delta
      setFraction(clampToDetents(fractionAfter(travel, at.height), stops))
    },
    onEnd(delta, { velocity }) {
      const at = gesture.current
      if (!moved.current && Math.abs(delta) <= 2) {
        setFraction(at.startFraction)
        return
      }
      moved.current = true
      const travel = travelFor(at.startFraction, at.height) + delta
      const landed = restingFraction({
        fraction: clampToDetents(fractionAfter(travel, at.height), stops),
        velocity,
        extent: at.height,
        detents: stops,
        dismissBelow,
      })
      if (landed === null) {
        onClose?.()
        return
      }
      setFraction(landed)
    },
    onCancel() {
      moved.current = true
      setFraction(gesture.current.startFraction)
    },
  })

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

  if (!presence.mounted) return null

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
      data-hozo-pressable=""
      type="button"
      aria-label={handleAccessibilityLabel}
      className={handleClassName}
      // Touch scrolling would otherwise take the gesture before the first move
      // arrives. Inline because it is what makes the drag work, not how it looks.
      style={{ touchAction: 'none' }}
      onClick={(event) => {
        // Captured drags still produce a browser click. It must not cycle the
        // detent a second time; keyboard activation remains an ordinary click.
        if (event.detail > 0 && moved.current) {
          event.preventDefault()
          return
        }
        const next = cycleDetent(fraction, stops)
        if (next !== null) setFraction(next)
      }}
      onKeyDown={onHandleKeyDown}
      {...drag.handlers}
    />
  ) : (
    <div
      aria-hidden="true"
      className={handleClassName}
      style={{ touchAction: 'none' }}
      {...drag.handlers}
    />
  )

  return (
    <Portal disabled={!portal}>
      <div
        className={className}
        data-hozo-state={presence.state}
        data-state={presence.state}
        // Leaving: still drawn, no longer there. `inert` takes the whole layer
        // out of the tab order and the accessibility tree, and the pointer
        // passes through the full-screen scrim to the page it is uncovering.
        inert={leaving || undefined}
        style={leaving ? { pointerEvents: 'none' } : undefined}
      >
        {/*
          The scrim is its own element and is hidden from the accessibility tree:
          `aria-modal` has already told a reader the page is unavailable, and a
          second unnamed region saying so is noise. It has no press handler
          either -- `DismissableLayer` sees a press outside the sheet, and the
          scrim is outside it.
        */}
        <div aria-hidden="true" className={scrimClassName} data-state={presence.state} />
        <DismissableLayer onDismiss={leaving ? undefined : onClose} style={{ display: 'contents' }}>
          <FocusScope
            trapped
            autoFocus
            restoreFocus
            active={!leaving}
            style={{ display: 'contents' }}
          >
            <div
              ref={(node) => {
                panelRef.current = node
                presence.ref(node)
              }}
              onTransitionEnd={presence.onTransitionEnd}
              onAnimationEnd={presence.onAnimationEnd}
              data-state={presence.state}
              role="dialog"
              aria-modal="true"
              aria-label={accessibilityLabelledBy ? undefined : accessibilityLabel}
              aria-labelledby={accessibilityLabelledBy}
              data-hozo-state={presence.state}
              data-hozo-dragging={drag.dragging ? 'true' : undefined}
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
