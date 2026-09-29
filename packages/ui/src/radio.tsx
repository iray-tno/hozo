/**
 * A radio group with a look, wearing `@hozo/patterns`.
 *
 * The behaviour is theirs: one tab stop for the whole group with the arrows
 * choosing within it, which is what makes a radio group a radio group and not
 * a column of checkboxes. This file draws a ring and a dot.
 *
 * ## Drawn from `aria-checked`, which is the only state there is
 *
 * These options are `<div role="radio">` and not `<input type="radio">`, so
 * there is no `:checked` to select and no browser-drawn control to override --
 * which is the same reason `disabled:` compiles to `[data-hozo-disabled]` in
 * this project (decision 003, rule 2). `aria-checked:` is the attribute a
 * reader announces and therefore the one the dot is drawn from: one fact, read
 * twice, with no prop of ours to disagree with it.
 *
 * ## Two pseudo-elements and a padded row
 *
 * `::before` is the 16px ring and `::after` is the 8px dot, both positioned
 * absolutely against the row, with `ps-9` keeping the label clear of them.
 * Centred with `-mt-2` and `-mt-1` -- half of each -- rather than a transform,
 * for the reason `Slider` gives: the margin is logical, so the control stays on
 * the leading edge when the document runs the other way.
 *
 * The alternative is a single circle that fills with the accent when chosen. It
 * is one class shorter and it reads as a checkbox with rounded corners; the
 * ring-and-dot is what says "one of these" at a glance.
 */

import { RadioGroup as RadioGroupPattern, type RadioGroupProps } from '@hozo/patterns'

export type HozoRadioGroupProps<T> = Omit<RadioGroupProps<T>, 'optionClassName'>
export type { RadioOption as HozoRadioOption } from '@hozo/patterns'

const HORIZONTAL = 'flex flex-row flex-wrap gap-2'
const VERTICAL = 'flex flex-col gap-1'

const option =
  "relative block w-full text-left text-sm leading-6 text-hozo-text cursor-pointer rounded-hozo-control ps-9 pe-3 py-2 hover:bg-hozo-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus before:content-[''] before:absolute before:start-2 before:top-3 before:size-4 before:rounded-full before:border-2 before:border-hozo-border-strong before:bg-hozo-surface after:content-[''] after:absolute after:start-3 after:top-4 after:size-2 after:rounded-full aria-checked:before:border-hozo-accent aria-checked:after:bg-hozo-accent aria-disabled:text-hozo-text-subtle aria-disabled:cursor-not-allowed aria-disabled:hover:bg-transparent aria-disabled:before:border-hozo-border"

export function HozoRadioGroup<T>({ className, orientation, ...rest }: HozoRadioGroupProps<T>) {
  const own = orientation === 'horizontal' ? HORIZONTAL : VERTICAL
  return (
    <RadioGroupPattern
      {...rest}
      orientation={orientation}
      className={className ? `${own} ${className}` : own}
      optionClassName={option}
    />
  )
}

export { HozoRadioGroup as RadioGroup, type HozoRadioGroupProps as RadioGroupProps }
