import { DismissableLayer, FocusScope, Portal } from '@hozo/behaviors'
import type { ReactNode } from 'react'
import { useScrollLock } from './scroll-lock.ts'

/**
 * Which edge the drawer comes in from.
 *
 * Physical rather than logical, and that is a deferral rather than a preference.
 * A logical `start`/`end` would have to become a physical edge somewhere, and
 * the only thing that can turn one into the other is a resolved writing
 * direction -- which is #157's substrate and does not exist yet. Naming it
 * `start` today would mean guessing left, which is the same bug with a better
 * word on it.
 */
export type HozoDrawerSide = 'left' | 'right'

export interface HozoDrawerProps {
  /** Whether the drawer is showing. The caller owns this, as with `Dialog`. */
  open?: boolean
  /** Called when the drawer asks to go away: Escape, or the scrim. */
  onClose?: () => void
  /** The drawer's accessible name. */
  accessibilityLabel?: string
  /** An id inside the drawer that names it, when the name is already on screen. */
  accessibilityLabelledBy?: string
  side?: HozoDrawerSide
  /**
   * Whether the drawer is rendered into the portal host.
   *
   * True in practice; false is for tests, which is the same reason `Tooltip` and
   * `BottomSheet` have it -- `Portal` renders nothing until it has mounted, so a
   * server render of a portalled drawer is an empty string.
   */
  portal?: boolean
  className?: string
  scrimClassName?: string
  panelClassName?: string
  testID?: string
  children?: ReactNode
}

/**
 * A modal panel that slides in from the left or right edge.
 *
 * `Drawer = Portal + FocusScope + DismissableLayer`, and on this platform that
 * is the whole of it -- #142 asks for a gesture under *Native* and asks the Web
 * half for "off-canvas sliding nav, focus trapping when open, scroll lock on
 * body". So this file has no pointer handling at all, and the one thing it does
 * that `BottomSheet` should also have been doing is `useScrollLock`.
 *
 * That asymmetry is worth stating rather than quietly closing: a swipe-to-dismiss
 * here would have to drag the panel's own body, because a drawer has no grabber
 * to put it on, and dragging a body fights text selection. On a phone there is no
 * text selection to fight and no Escape key to fall back on, which is why the
 * gesture belongs on that side and not on this one.
 *
 * ## Opening is the caller's, and an edge swipe is not in here
 *
 * #142 lists edge-swipe-to-open under Native. It is not implemented, in either
 * half, and the reason is that a closed drawer cannot listen at the screen's edge
 * without rendering an invisible catcher over the application's content for as
 * long as it is closed -- a decision about the whole screen rather than about the
 * drawer, and one that collides with the platforms' own back gestures. It can
 * also never be the only way to open a drawer, since nobody who cannot swipe
 * could reach it, so there is always a trigger and this would be an enhancement
 * on top of one. Left out deliberately; `open` is a prop, as with `Dialog`.
 *
 * ## Modal, for `BottomSheet`'s reason
 *
 * There is a scrim, and something that dims the page has already said the page is
 * unavailable -- so `aria-modal` and the Tab trap say the same thing.
 * `display: contents` on both wrappers for the reason `bottom-sheet.tsx` gives.
 */
export function HozoDrawer({
  open = false,
  onClose,
  accessibilityLabel,
  accessibilityLabelledBy,
  side = 'left',
  portal = true,
  className,
  scrimClassName,
  panelClassName,
  testID,
  children,
}: HozoDrawerProps) {
  useScrollLock(open)

  if (!open) return null

  return (
    <Portal disabled={!portal}>
      <div className={className} data-hozo-side={side} data-hozo-state="open">
        {/*
          Hidden from the accessibility tree and carrying no press handler:
          `aria-modal` has said the page is unavailable, and `DismissableLayer`
          already sees a press outside the panel, which the scrim is.
        */}
        <div aria-hidden="true" className={scrimClassName} />
        <DismissableLayer onDismiss={onClose} style={{ display: 'contents' }}>
          <FocusScope trapped autoFocus restoreFocus style={{ display: 'contents' }}>
            <div
              role="dialog"
              aria-modal="true"
              aria-label={accessibilityLabelledBy ? undefined : accessibilityLabel}
              aria-labelledby={accessibilityLabelledBy}
              data-hozo-side={side}
              data-hozo-state="open"
              data-testid={testID}
              className={panelClassName}
            >
              {children}
            </div>
          </FocusScope>
        </DismissableLayer>
      </div>
    </Portal>
  )
}

export {
  HozoDrawer as Drawer,
  type HozoDrawerProps as DrawerProps,
  type HozoDrawerSide as DrawerSide,
}
