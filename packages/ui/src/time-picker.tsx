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
 * ## The spinbutton was a 9 by 20 target, and a check found it
 *
 * `fieldClassName` dresses the group that holds the value and its arrows, and
 * the `role="spinbutton"` inside it had no class at all -- so it was the width
 * of its own digits, and the ring had to be `focus-within:` on the group because
 * there was nowhere else to put it. This file said so in a comment and called it
 * someone else's package.
 *
 * `check-appearance.mjs` then measured it: **9 by 20 pixels** for an hour
 * reading "9", against WCAG 2.5.8's 24 by 24. A prose caveat became a failing
 * number, `@hozo/form` gained `valueClassName`, and the value is now 32 by 48
 * with the ring on the element that actually takes focus -- which is what 2.4.11
 * describes.
 *
 * `tabular-nums`, because 9 and 12 are different widths in a proportional face
 * and the arrows should not move when the hour does.
 */

import { TimePicker as TimePickerPattern, type TimePickerProps } from '@hozo/form'

export type HozoTimePickerProps = Omit<
  TimePickerProps,
  'fieldClassName' | 'valueClassName' | 'periodClassName' | 'stepClassName'
>

const group = 'inline-flex flex-row items-center gap-2'

const field =
  'relative flex flex-row items-center min-h-12 pe-6 rounded-hozo-control border border-hozo-border-strong bg-hozo-surface text-sm tabular-nums text-hozo-text'

/**
 * The spinbutton, which is the element a pointer has to hit and the element
 * that takes focus.
 *
 * It had no class of its own until `valueClassName` existed, so it was the
 * width of its own digits: `check-appearance.mjs` measured **9 by 20** for an
 * hour reading "9", against WCAG 2.5.8's 24 by 24. `min-w-8` and the field's
 * height make it 32 by 48, and it is where the ring goes now -- on the focused
 * element, which is what 2.4.11 describes, rather than `focus-within:` on the
 * group, which was the only place it could go.
 *
 * `ps-3 pe-2` here rather than on the field, so the padding is part of the
 * target instead of a gap beside it.
 */
const value =
  'inline-flex min-w-8 self-stretch items-center justify-center ps-3 pe-2 rounded-hozo-control cursor-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus'

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
      valueClassName={value}
      stepClassName={step}
      periodClassName={period}
    />
  )
}

export { HozoTimePicker as TimePicker, type HozoTimePickerProps as TimePickerProps }
