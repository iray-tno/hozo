/**
 * A listbox with a look, wearing `@hozo/patterns`.
 *
 * The behaviour is theirs: the roving tab stop, the arrows, typeahead, the
 * difference between one selection and several, and `aria-multiselectable`
 * saying which it is. This file draws a bordered box and a chosen row.
 *
 * ## The chosen row is not only a colour
 *
 * `aria-selected:bg-hozo-accent-subtle` and a weight change, together. A
 * background alone fails WCAG 1.4.1 -- "colour is not the only visual means of
 * conveying information" -- and the weight is what survives a monochrome
 * display, a colour-blind reader and a printout. The single-select case makes
 * this sharper than it sounds: a list where the chosen row is a pale tint and
 * nothing else is a list whose answer disappears at a glance.
 *
 * A `::before` tick would be the other way to do it, and it costs a column of
 * padding on every row in a control that is often a dropdown's inside. The
 * weight is cheaper and reads at the same distance.
 *
 * ## `max-h-60 overflow-y-auto`
 *
 * A listbox with more options than fit is the normal case, and a scroll
 * container is how it behaves rather than pushing the page. The pattern moves
 * focus with the arrows and the browser scrolls a focused element into view,
 * so keyboard and pointer agree without this file knowing anything about it.
 */

import { Listbox as ListboxPattern, type ListboxProps } from '@hozo/patterns'

/**
 * Distributed over the union, for the reason `Accordion` gives at more length:
 * `Omit<A | B, K>` collapses the two halves and takes the `multiple`
 * discriminant with them, which would let a single-select listbox be handed an
 * array of values.
 */
type Styled<P> = P extends unknown ? Omit<P, 'optionClassName'> : never

export type HozoListboxProps<T> = Styled<ListboxProps<T>>
export type { ListboxOption as HozoListboxOption } from '@hozo/patterns'

const box =
  'flex flex-col gap-1 max-h-60 overflow-y-auto rounded-hozo-surface border border-hozo-border bg-hozo-surface p-1'

const option =
  'cursor-pointer rounded-hozo-control px-3 py-2 text-sm text-hozo-text hover:bg-hozo-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus aria-selected:bg-hozo-accent-subtle aria-selected:font-semibold aria-selected:text-hozo-accent-text aria-disabled:text-hozo-text-subtle aria-disabled:cursor-not-allowed aria-disabled:hover:bg-transparent'

export function HozoListbox<T>({ className, ...rest }: HozoListboxProps<T>) {
  return (
    <ListboxPattern
      // The cast is the price of the distributed type above: JSX resolves a
      // spread of a union poorly. The discriminant is intact where the caller
      // writes it, which is where it earns its keep.
      {...(rest as ListboxProps<T>)}
      className={className ? `${box} ${className}` : box}
      optionClassName={option}
    />
  )
}

export { HozoListbox as Listbox, type HozoListboxProps as ListboxProps }
