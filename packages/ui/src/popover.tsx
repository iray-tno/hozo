/**
 * A popover with a look, wearing `@hozo/patterns`.
 *
 * The behaviour is theirs and is #142's equation --
 * `FloatingPositioner + FocusScope + DismissableLayer` -- plus the two halves
 * people forget: Escape with focus still on the trigger, and a non-modal panel
 * closing when focus leaves it. This file draws a panel.
 *
 * ## The same panel as `Dialog`, and not the same element
 *
 * Both are `role="dialog"` and both want a surface with a radius and a shadow.
 * The lists are written out separately anyway, because `Dialog` is a real
 * `<dialog>` whose scrim is its own `::backdrop` and whose centring is the user
 * agent's, while this is a positioned `<div>` the floating positioner places. A
 * shared constant would invite `backdrop:` into a list where it does nothing.
 *
 * ## `min-w-56 max-w-xs`
 *
 * A popover narrower than its trigger reads as a tooltip that grew, and one
 * wider than a column reads as a dialog that failed to open. Both bounds, so
 * neither happens to content the caller has not measured.
 */

import { Popover as PopoverPattern, type PopoverProps } from '@hozo/patterns'

export type HozoPopoverProps = Omit<PopoverProps, 'triggerClassName' | 'panelClassName'>

/**
 * The neutral `Button`'s list again, for the reason `Menu` gives: the pattern's
 * trigger is a plain `<button>` and `Button` is the primitive, so a shared
 * constant would look like one thing changeable in one place while
 * `disabled:` -- which compiles to `[data-hozo-disabled]` -- works on one and
 * not the other. Here it does work, because the pattern writes that attribute.
 */
const trigger =
  'inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold rounded-hozo-control transition-colors cursor-pointer bg-hozo-surface text-hozo-text-body border border-hozo-border-strong hover:bg-hozo-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus disabled:text-hozo-text-subtle disabled:cursor-not-allowed disabled:hover:bg-transparent'

const panel =
  'flex flex-col gap-3 min-w-56 max-w-xs rounded-hozo-panel border border-hozo-border bg-hozo-surface p-4 text-sm text-hozo-text-body shadow-hozo-surface'

export function HozoPopover({ className, ...rest }: HozoPopoverProps) {
  return (
    <PopoverPattern
      {...rest}
      className={className}
      triggerClassName={trigger}
      panelClassName={panel}
    />
  )
}

export { HozoPopover as Popover, type HozoPopoverProps as PopoverProps }
