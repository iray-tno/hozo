import { DismissableLayer, FocusScope, Portal, usePresence } from '@hozo/behaviors'
import type { ReactNode } from 'react'
import type { HozoDrawerSide } from './drawer-side.ts'
import { useHozoDrawerSide } from './drawer-side-hook.ts'
import { useScrollLock } from './scroll-lock.ts'

/**
 * `'start'` and `'end'` follow the reading direction: `HozoI18nProvider`'s
 * `dir`, or the document's own when there is no provider. `'left'` and
 * `'right'` are physical. See `drawer-side.ts`.
 */
export type { HozoDrawerSide }

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
  const edge = useHozoDrawerSide(side)
  // The panel stays mounted while it animates out, as `data-state="closed"`
  // on the wrapper, the scrim and the panel (decision 007). The panel's
  // transition is the one waited for; with none it goes at once.
  const presence = usePresence(open)
  const leaving = presence.mounted && !open

  if (!presence.mounted) return null

  return (
    <Portal disabled={!portal}>
      <div
        className={className}
        data-hozo-side={edge}
        data-hozo-state={presence.state}
        data-state={presence.state}
        // Leaving: still drawn, no longer there. `inert` takes the whole layer
        // out of the tab order and the accessibility tree, and the pointer
        // passes through the full-screen scrim to the page it is uncovering.
        inert={leaving || undefined}
        style={leaving ? { pointerEvents: 'none' } : undefined}
      >
        {/*
          Hidden from the accessibility tree and carrying no press handler:
          `aria-modal` has said the page is unavailable, and `DismissableLayer`
          already sees a press outside the panel, which the scrim is.
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
              ref={presence.ref}
              onTransitionEnd={presence.onTransitionEnd}
              onAnimationEnd={presence.onAnimationEnd}
              data-state={presence.state}
              role="dialog"
              aria-modal="true"
              aria-label={accessibilityLabelledBy ? undefined : accessibilityLabel}
              aria-labelledby={accessibilityLabelledBy}
              data-hozo-side={edge}
              data-hozo-state={presence.state}
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
