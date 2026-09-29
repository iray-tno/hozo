/**
 * A combobox with a look, wearing `@hozo/patterns`.
 *
 * The behaviour is theirs and it is the most intricate control in the package:
 * the filtering, the inline completion, `aria-activedescendant` moving without
 * focus leaving the input, the popup's `aria-controls`/`aria-expanded` pair,
 * committing on Enter and on a pointer down that does not blur the field. This
 * file draws a field and a list.
 *
 * ## `aria-selected` here means *highlighted*, not *chosen*
 *
 * The pattern sets it on the **active** option -- the one the arrows have moved
 * to -- because that is what ARIA's combobox pattern asks for: the chosen value
 * lives in the input, and the popup's job is to show where you are in it. So
 * this list's `aria-selected:` styling is a highlight and reads like one, which
 * is the opposite emphasis from `Listbox`, where the same attribute means the
 * answer and is drawn with a weight change.
 *
 * Getting that backwards is not a style mistake, it is a lie about state: a
 * combobox whose highlighted row looks chosen tells you that arrowing past an
 * option selected it.
 *
 * ## The field's class list is `Input`'s, written out again
 *
 * The pattern renders a plain `<input>`; `Input` wraps the `TextInput`
 * primitive. Two elements, two lowerings, so two literals -- the reason `Menu`
 * gives for its trigger. What they must not do is drift, which is what
 * `combobox.test.ts` checks by reading both out of the source.
 *
 * `matchAnchorWidth` is the pattern's, so the list is the field's width without
 * this file saying so.
 */

import { Combobox as ComboboxPattern, type ComboboxProps } from '@hozo/patterns'

export type HozoComboboxProps<T> = Omit<
  ComboboxProps<T>,
  'inputClassName' | 'listClassName' | 'optionClassName'
>
export type { ComboboxOption as HozoComboboxOption } from '@hozo/patterns'

const field =
  'w-full rounded-hozo-control border bg-hozo-surface px-3 py-2 text-sm text-hozo-text border-hozo-border-strong placeholder:text-hozo-text-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus aria-invalid:border-hozo-danger disabled:bg-hozo-surface-raised disabled:text-hozo-text-subtle disabled:cursor-not-allowed'

const list =
  'flex flex-col gap-0.5 max-h-60 overflow-y-auto rounded-hozo-surface border border-hozo-border bg-hozo-surface p-1 shadow-hozo-surface'

/**
 * A highlight and not a selection: a tint and nothing else.
 *
 * No weight change, deliberately -- that is `Listbox`'s way of saying "this is
 * the answer", and the two must not look the same.
 */
const option =
  'cursor-pointer rounded-hozo-control px-3 py-1.5 text-sm text-hozo-text hover:bg-hozo-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus aria-selected:bg-hozo-accent-subtle aria-disabled:text-hozo-text-subtle aria-disabled:cursor-not-allowed aria-disabled:hover:bg-transparent'

export function HozoCombobox<T>({ className, ...rest }: HozoComboboxProps<T>) {
  return (
    <ComboboxPattern
      {...rest}
      className={className}
      inputClassName={field}
      listClassName={list}
      optionClassName={option}
    />
  )
}

export { HozoCombobox as Combobox, type HozoComboboxProps as ComboboxProps }
