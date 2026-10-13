/**
 * A radio group with a look, wearing `@hozo/patterns`.
 *
 * The behaviour is theirs: one tab stop for the whole group with the arrows
 * choosing within it, which is what makes a radio group a radio group and not
 * a column of checkboxes. This file draws a ring and a dot.
 *
 * ## Drawn from the same state as `aria-checked`
 *
 * These options are `<div role="radio">` and not `<input type="radio">`, so
 * there is no `:checked` to select and no browser-drawn control to override --
 * which is the same reason `disabled:` compiles to `[data-hozo-disabled]` in
 * this project (decision 003, rule 2). `aria-checked:` is the attribute a
 * reader announces. The indicator callback gets that very checked state,
 * so it remains one fact read twice, with no prop of ours to disagree with it.
 *
 * ## Two real decorative slots and a padded row
 *
 * The 16px ring is positioned against the row; its 8px dot is centred inside
 * it. `ps-9` keeps the label clear. With the 24px first line box and 8px
 * padding, `start-2 top-3` centres the ring at (16, 20), and the dot shares
 * that centre. Logical positioning keeps it on the leading edge in RTL.
 * These are spans/Views hidden by the pattern, not pseudo-elements a Native
 * backend has no way to paint. No drawing state is stored in this package.
 *
 * The alternative is a single circle that fills with the accent when chosen. It
 * is one class shorter and it reads as a checkbox with rounded corners; the
 * ring-and-dot is what says "one of these" at a glance.
 */

import { RadioGroup as RadioGroupPattern, type RadioGroupProps } from '@hozo/patterns'

export type HozoRadioGroupProps<T> = Omit<RadioGroupProps<T>, 'optionClassName' | 'indicator'>
export type { RadioOption as HozoRadioOption } from '@hozo/patterns'

const HORIZONTAL = 'flex flex-row flex-wrap gap-2'
const VERTICAL = 'flex flex-col gap-1'

const option =
  'relative block w-full text-left text-sm leading-6 text-hozo-text cursor-pointer rounded-hozo-control ps-9 pe-3 py-2 hover:bg-hozo-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus aria-disabled:text-hozo-text-subtle aria-disabled:cursor-not-allowed aria-disabled:hover:bg-transparent'

export function radioIndicator({ checked, disabled }: { checked: boolean; disabled: boolean }) {
  const className = disabled
    ? 'absolute start-2 top-3 flex size-4 items-center justify-center rounded-full border-2 border-hozo-border bg-hozo-surface'
    : checked
      ? 'absolute start-2 top-3 flex size-4 items-center justify-center rounded-full border-2 border-hozo-accent bg-hozo-surface'
      : 'absolute start-2 top-3 flex size-4 items-center justify-center rounded-full border-2 border-hozo-border-strong bg-hozo-surface'
  const markClassName = checked
    ? disabled
      ? 'size-2 rounded-full bg-hozo-text-subtle'
      : 'size-2 rounded-full bg-hozo-accent'
    : undefined
  return { className, markClassName }
}

export function HozoRadioGroup<T>({ className, orientation, ...rest }: HozoRadioGroupProps<T>) {
  const own = orientation === 'horizontal' ? HORIZONTAL : VERTICAL
  return (
    <RadioGroupPattern
      {...rest}
      orientation={orientation}
      className={className ? `${own} ${className}` : own}
      optionClassName={option}
      indicator={radioIndicator}
    />
  )
}

export { HozoRadioGroup as RadioGroup, type HozoRadioGroupProps as RadioGroupProps }
