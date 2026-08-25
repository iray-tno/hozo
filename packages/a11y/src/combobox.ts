// The rules a combobox needs, on the same terms as the rest: no `react`,
// no `document`.
//
// A combobox is the one pattern here where focus does not move. It stays
// in the text field the whole time -- because the user is typing, and a
// field that loses focus stops receiving keystrokes -- and which option is
// current is said with `aria-activedescendant`, an id naming an element
// somewhere else. Roving tabindex is the wrong mechanism here and using it
// is the commonest structural mistake in a hand-built one: the moment
// ArrowDown moves real focus into the list, typing stops working.
//
// Two things are worth being rules rather than inline logic. Filtering,
// because "starts with" and "contains" are different products and the
// choice is the author's. And inline completion, which is small, is in
// every native combobox, and is wrong in most hand-built ones for one
// reason: it must not fire while the user is deleting.

/** How much the field completes on its own. */
export type Autocomplete = 'none' | 'list' | 'both'

export interface FilterOptions {
  /** What the user has typed. */
  query: string
  labels: readonly string[]
  /**
   * Whether a match has to begin with the query.
   *
   * `starts` is what a native `<select>` and most pickers do, and it is
   * required for inline completion to make sense -- completing "ma" to
   * "Birmingham" would rewrite what was typed. `contains` is better for
   * long labels where the distinguishing word is not first.
   */
  match?: 'starts' | 'contains'
}

/**
 * The indices still showing, in their original order.
 *
 * An empty query shows everything: a combobox that shows nothing until a
 * key is pressed has hidden the fact that it has options at all, which is
 * the difference between a picker and a search box.
 */
export function filterOptions({ query, labels, match = 'starts' }: FilterOptions): number[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return labels.map((_, index) => index)
  return labels.flatMap((label, index) => {
    const haystack = label.toLowerCase()
    const hit = match === 'starts' ? haystack.startsWith(needle) : haystack.includes(needle)
    return hit ? [index] : []
  })
}

export interface Completion {
  /** What the field should now contain. */
  value: string
  /** The start of the part the user did not type. */
  selectionStart: number
  selectionEnd: number
}

/**
 * The field's value after completing `query` to `label`, or `null` to
 * leave it alone.
 *
 * The completed part is selected rather than merely appended, which is
 * what makes the next keystroke replace it instead of landing after it.
 * Typing `m`, `a` into a list containing Madrid gives "Madrid" with "drid"
 * selected; typing `n` next gives "man…" and not "Madridn".
 *
 * `deleting` is the whole reason this is a function and not two lines at
 * the call site. Backspace on "Madrid" leaves "Madri", and completing that
 * puts "Madrid" straight back -- the field becomes impossible to clear,
 * one character at a time, and it looks like the keyboard is broken. Every
 * native combobox suppresses completion on a deletion, and it is the part
 * hand-built ones leave out.
 */
export function inlineCompletion(
  query: string,
  label: string | undefined,
  deleting: boolean,
): Completion | null {
  if (deleting || query === '' || label === undefined) return null
  if (!label.toLowerCase().startsWith(query.toLowerCase())) return null
  if (label.length === query.length) return null
  return {
    // The label's own casing from the point the user stopped typing, and
    // theirs up to it: completing "mad" to "Madrid" must not rewrite the
    // "mad" they can see themselves having typed.
    value: query + label.slice(query.length),
    selectionStart: query.length,
    selectionEnd: label.length,
  }
}

/**
 * Which option is current after a vertical key, as an index into the
 * *filtered* list -- or `null` when the key is not ours.
 *
 * Separate from `roving.ts` because the starting state is different in a
 * way that matters: a combobox can have nothing current at all. The field
 * has focus and the list is open and no option is active, which is not a
 * state a roving group can be in, and it is the state a combobox is in
 * every time it opens. From there ArrowDown means "the first" and ArrowUp
 * means "the last".
 *
 * It does not wrap. In a roving group the ends joining up saves a long
 * walk back; here the list is a filtered set the user is narrowing, and
 * arriving back at the top after the last item reads as the list having
 * reset.
 */
export function activeAfter(
  key: 'ArrowDown' | 'ArrowUp',
  active: number | null,
  count: number,
): number | null {
  if (count === 0) return null
  if (active === null) return key === 'ArrowDown' ? 0 : count - 1
  const next = active + (key === 'ArrowDown' ? 1 : -1)
  if (next < 0) return 0
  if (next >= count) return count - 1
  return next
}
