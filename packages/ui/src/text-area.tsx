/**
 * An auto-growing multiline field with a look, wearing `@hozo/form`.
 *
 * The behaviour is theirs: the measurement, the cap that turns growth into
 * scrolling, and the character count that is a description rather than a live
 * region. This file draws a field and a counter.
 *
 * ## The same list as `Input`'s multiline, minus `resize-y`
 *
 * `Input` offers a `multiline` that is a plain textarea, and its list ends in
 * `min-h-24 resize-y` -- a fixed minimum and a grab handle, because nothing is
 * measuring it. Here the height is measured, so a resize handle would be a second
 * opinion about it: drag it taller and the next keystroke takes it back. The
 * minimum is `minRows` instead, which is a number of lines rather than a number
 * of pixels and therefore survives a change of text size.
 *
 * ## `leading-6`, and why it is not decoration
 *
 * `minRows` and `maxRows` are line counts, so a line's height is arithmetic here
 * rather than taste. `leading-6` puts it at 24px -- on the 4px grid, and a round
 * number of rows -- and the native half reads the same value out of its resolved
 * style. A list that left the line height to the font would leave both halves
 * guessing, which is the one thing `usableLineHeight` exists to fall back to.
 */

import { TextArea as TextAreaForm, type TextAreaProps } from '@hozo/form'

export type HozoTextAreaProps = Omit<
  TextAreaProps,
  'className' | 'fieldClassName' | 'countClassName'
>

const wrapper = 'flex w-full flex-col gap-1'

const field =
  'w-full rounded-hozo-control border bg-hozo-surface px-3 py-2 text-sm leading-6 text-hozo-text border-hozo-border-strong placeholder:text-hozo-text-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus aria-invalid:border-hozo-danger disabled:bg-hozo-surface-raised disabled:text-hozo-text-subtle disabled:cursor-not-allowed'

/**
 * `self-end`, because a count reads as a count when it sits under the right-hand
 * end of the field. `tabular-nums` so the digits do not shuffle the words beside
 * them on every keystroke.
 */
const count = 'self-end text-xs tabular-nums text-hozo-text-muted'

export function HozoTextArea(props: HozoTextAreaProps) {
  return (
    <TextAreaForm {...props} className={wrapper} fieldClassName={field} countClassName={count} />
  )
}

export { HozoTextArea as TextArea, type HozoTextAreaProps as TextAreaProps }
