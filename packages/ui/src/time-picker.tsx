/**
 * A clock with a look, wearing `@hozo/form`.
 *
 * The behaviour is theirs: `role="spinbutton"` on a field that can be typed as
 * well as stepped, `aria-valuetext` carrying the **whole** time rather than one
 * field's digits, the arrows kept out of the tab order because Up and Down
 * already do their job, and the twelve-hour question asked of the locale. This
 * file places the arrows and draws the field.
 *
 * ## The arrows are the target-size case, and the attribute they need was not
 * ## stylable until last week
 *
 * Each arrow is 24 by 24, which WCAG 2.5.8 asks for, stacked inside the field's
 * inline end -- increase at the top, decrease at the bottom. Which end is which
 * comes from `data-hozo-step`, a *valued* data attribute: the demo's own story
 * has written `data-[hozo-step=increase]:bottom-1/2` since the picker shipped,
 * and it did nothing at all, because the candidate scanner cut a class name at
 * its `=` (#679). Both arrows were drawn in the same place.
 *
 * The field is 48 tall to hold two of them, which is also the height that makes
 * the whole control a comfortable target rather than a tall thin one.
 *
 * ## The focus ring is on the field, because the focusable element takes no
 * ## class
 *
 * `fieldClassName` is on the group that holds the value and its arrows;
 * `@hozo/form` puts no class on the `role="spinbutton"` inside it, which is the
 * element that actually takes focus. So the ring is `focus-within:` on the
 * field, which is a correct focus indicator -- it is visible, and it surrounds
 * the control a person is operating.
 *
 * The alternative is a `valueClassName` in `@hozo/form`, and it would be the
 * better answer: a ring on the element with focus is what 2.4.11 describes, and
 * `focus-within` also lights up when a pointer puts focus on an arrow. It is a
 * prop on someone else's package, so it is not this change.
 *
 * `tabular-nums`, because 9 and 12 are different widths in a proportional face
 * and the arrows should not move when the hour does.
 */

import { TimePicker as TimePickerPattern, type TimePickerProps } from '@hozo/form'

export type HozoTimePickerProps = Omit<
  TimePickerProps,
  'fieldClassName' | 'periodClassName' | 'stepClassName'
>

const group = 'inline-flex flex-row items-center gap-2'

const field =
  'relative flex flex-row items-center min-h-12 ps-3 pe-6 rounded-hozo-control border border-hozo-border-strong bg-hozo-surface text-sm tabular-nums text-hozo-text focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-hozo-focus'

/**
 * Both arrows, placed by the attribute that says which one each is.
 *
 * 24 by 24 each (`size-6`), so 2.5.8 is met by the control rather than by the
 * application remembering to size it.
 */
const step =
  'absolute end-0 inline-flex size-6 items-center justify-center text-xs text-hozo-text-muted cursor-pointer rounded-hozo-control hover:bg-hozo-surface-hover hover:text-hozo-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus data-[hozo-step=increase]:top-0 data-[hozo-step=decrease]:bottom-0 disabled:text-hozo-text-subtle disabled:cursor-not-allowed disabled:hover:bg-transparent'

const period =
  'inline-flex min-h-12 items-center justify-center rounded-hozo-control border border-hozo-border-strong bg-hozo-surface px-3 text-sm font-semibold text-hozo-text cursor-pointer hover:bg-hozo-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus disabled:text-hozo-text-subtle disabled:cursor-not-allowed disabled:hover:bg-transparent'

export function HozoTimePicker({ className, ...rest }: HozoTimePickerProps) {
  return (
    <TimePickerPattern
      {...rest}
      className={className ? `${group} ${className}` : group}
      fieldClassName={field}
      stepClassName={step}
      periodClassName={period}
    />
  )
}

export { HozoTimePicker as TimePicker, type HozoTimePickerProps as TimePickerProps }
