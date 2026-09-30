import { DismissableLayer, FloatingPositioner, FocusScope, type Placement } from '@hozo/behaviors'
import { type KeyboardEvent, type ReactNode, useCallback, useId, useRef, useState } from 'react'

export interface HozoPopoverProps {
  /** What the trigger button says. */
  trigger: ReactNode
  /** The panel's contents, which are the caller's and may be anything. */
  children?: ReactNode
  /**
   * The panel's accessible name.
   *
   * A `role="dialog"` with no name is a dialog a reader announces and can say
   * nothing about, which is the same objection `Card` records against an
   * unnamed `<section>`. Required in practice rather than in the type, because
   * a caller who names the panel from its own heading passes
   * `accessibilityLabelledBy` instead.
   */
  accessibilityLabel?: string
  /** An id inside the panel that names it, when the name is already on screen. */
  accessibilityLabelledBy?: string
  /**
   * Whether the rest of the page is taken away while this is open.
   *
   * **False by default, and that is the interesting decision.** A modal popover
   * has to do two things together -- announce `aria-modal` *and* trap Tab -- or
   * it does the worse half of each: a reader stops offering the page while the
   * keyboard walks straight out of the panel. `DatePicker` is modal for that
   * reason, because a grid you arrow around is unusable with Tab escaping it.
   *
   * Most popovers are not that. A card with two links in it should leave the
   * page reachable, and a reader should be able to read past it. So the default
   * is non-modal, and a non-modal popover closes when focus leaves it -- see
   * `onBlur` below, which is the half people forget and which leaves an open
   * panel behind the page otherwise.
   */
  modal?: boolean
  placement?: Placement
  offset?: number
  /** Open when it mounts; uncontrolled after that. */
  defaultOpen?: boolean
  /** Open, when the caller wants to own it. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  disabled?: boolean
  className?: string
  triggerClassName?: string
  panelClassName?: string
}

/**
 * A rich popup anchored to the control that opens it.
 *
 * `Popover = FloatingPositioner + FocusScope + DismissableLayer`, which is
 * #142's own equation and the reason this is the next Layer 3 target after
 * `Dialog` and `Tooltip`: it needs nothing new from `@hozo/behaviors`, so what it
 * proves is that the three compose.
 *
 * The composition already existed, inside `DatePicker` -- an anchored panel with
 * a focus scope and a dismiss layer, wrapped around one specific control. This
 * is that arrangement with the contents left to the caller, which is what makes
 * it a pattern rather than a component.
 *
 * ## Not a `Menu`, and the difference is in the roles
 *
 * `Menu` is a list of commands: `aria-haspopup="menu"`, one tab stop, arrows
 * moving between items. A popover holds arbitrary content, so it is
 * `aria-haspopup="dialog"` and Tab moves through whatever is inside it. Using a
 * menu for a form is the mistake those two roles exist to keep apart -- a reader
 * told "menu" expects commands and gets a text field.
 *
 * ## Not a `Tooltip` either
 *
 * A tooltip is a description of its trigger and never takes focus, which is why
 * it is `aria-describedby` and opens on hover. This takes focus and opens on a
 * press. A tooltip that held a link would be a link nobody can reach, and that
 * is exactly the case this exists for.
 */
export function HozoPopover({
  trigger,
  children,
  accessibilityLabel,
  accessibilityLabelledBy,
  modal = false,
  placement = 'bottom-start',
  offset = 4,
  defaultOpen = false,
  open: controlled,
  onOpenChange,
  disabled,
  className,
  triggerClassName,
  panelClassName,
}: HozoPopoverProps) {
  const base = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [uncontrolled, setUncontrolled] = useState(defaultOpen)
  const open = controlled ?? uncontrolled

  const change = useCallback(
    (next: boolean) => {
      if (controlled === undefined) setUncontrolled(next)
      onOpenChange?.(next)
    },
    [controlled, onOpenChange],
  )

  /**
   * Escape on the trigger, which `DismissableLayer` cannot see.
   *
   * The layer listens while the panel is open, and the trigger is outside it --
   * so pressing Escape with focus still on the trigger, before Tab has moved
   * into the panel, would otherwise do nothing at all.
   */
  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      change(false)
    }
  }

  return (
    <div className={className}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? `${base}-panel` : undefined}
        disabled={disabled}
        data-hozo-disabled={disabled ? '' : undefined}
        data-hozo-state={open ? 'open' : 'closed'}
        className={triggerClassName}
        onClick={() => change(!open)}
        onKeyDown={onTriggerKeyDown}
      >
        {trigger}
      </button>
      {open ? (
        <FloatingPositioner
          anchorRef={triggerRef}
          placement={placement}
          offset={offset}
          flip
          shift
          className="z-50"
        >
          {() => (
            <DismissableLayer onDismiss={() => change(false)}>
              {/*
                `aria-modal` and the trap travel together or not at all. The
                prop's own comment has the reasoning; what matters here is that
                one boolean decides both, so they cannot be set to disagree.
              */}
              <FocusScope trapped={modal} autoFocus restoreFocus>
                <div
                  role="dialog"
                  aria-modal={modal ? 'true' : undefined}
                  id={`${base}-panel`}
                  aria-label={accessibilityLabelledBy ? undefined : accessibilityLabel}
                  aria-labelledby={accessibilityLabelledBy}
                  data-hozo-state="open"
                  className={panelClassName}
                  onBlur={(event) => {
                    // A non-modal panel closes when focus leaves it, and a
                    // modal one cannot be left. `relatedTarget` is where focus
                    // is going: inside the panel is a hop between its own
                    // controls, and the trigger is where `restoreFocus` sends
                    // it on the way out -- closing on either would shut the
                    // panel under the first Tab.
                    if (modal) return
                    const next = event.relatedTarget as Node | null
                    if (next && typeof next.nodeType === 'number') {
                      if (event.currentTarget.contains(next)) return
                      if (triggerRef.current?.contains(next)) return
                    }
                    change(false)
                  }}
                >
                  {children}
                </div>
              </FocusScope>
            </DismissableLayer>
          )}
        </FloatingPositioner>
      ) : null}
    </div>
  )
}

export { HozoPopover as Popover, type HozoPopoverProps as PopoverProps }
