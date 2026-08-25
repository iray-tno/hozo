// Typing a letter to jump to an item.
//
// The rule half of it, on the same terms as `./roving.ts` and
// `./focus.ts`: no `react`, no `document`, no timers. The caller keeps the
// buffer and the clock; this decides what a buffer means.
//
// It is in every list widget people actually use -- a `<select>`, a file
// list, a menu -- and it is the thing that makes a long list usable
// without a mouse. It is also almost always missing from a hand-built
// menu, because it looks like a nicety until the list has forty items in
// it.

/** How long a keystroke stays part of the same search, in milliseconds. */
export const TYPEAHEAD_TIMEOUT_MS = 1000

/**
 * The search string after `key`, given what was typed before.
 *
 * Separate from the lookup because the caller owns the timer: it holds the
 * buffer and the moment it was last touched, and asks this what the buffer
 * now is. Returning the string rather than mutating anything is what keeps
 * the rule testable.
 *
 * A gap longer than the timeout starts a new search. Without that, coming
 * back to a list an hour later and pressing `s` would search for whatever
 * was typed before it plus `s`, and match nothing.
 */
export function nextSearch(previous: string, key: string, sinceLastKey: number): string {
  const buffer = sinceLastKey > TYPEAHEAD_TIMEOUT_MS ? '' : previous
  return buffer + key.toLowerCase()
}

export interface TypeaheadOptions {
  /** The items' labels, in order, as a screen reader would read them. */
  labels: readonly string[]
  /** Which item has focus now. */
  active: number
  /** Items that cannot take focus, by index. */
  disabled?: readonly number[]
}

/**
 * The index a search string lands on, or `null` for no match.
 *
 * Searching starts *after* the active item and wraps, so pressing `s`
 * repeatedly walks through every item beginning with s rather than
 * sticking on the first one. That behaviour is what the repeated-character
 * rule below preserves.
 *
 * One exception, and it is the one people notice: when every character
 * typed so far is the same character, the search is for that single
 * character. `sss` means "the third item starting with s", not "an item
 * called sss" -- which no item is. Without it the third press finds
 * nothing and focus stops moving, and the list appears to have broken.
 */
export function searchIndex(search: string, options: TypeaheadOptions): number | null {
  const { labels, active, disabled = [] } = options
  if (search === '' || labels.length === 0) return null

  const first = search.slice(0, 1)
  const repeated = search.length > 1 && [...search].every((character) => character === first)
  const needle = repeated ? first : search
  // A repeated character walks on from where focus is; anything else
  // starts from the active item itself, so typing the name of the item you
  // are already on does not move you off it.
  const from = repeated ? active + 1 : active

  for (let offset = 0; offset < labels.length; offset += 1) {
    const index = (from + offset + labels.length) % labels.length
    if (disabled.includes(index)) continue
    const label = labels[index]
    if (label !== undefined && label.trim().toLowerCase().startsWith(needle)) return index
  }
  return null
}

/**
 * Whether `key` is one to type into the search rather than act on.
 *
 * A single printable character. Not `Enter`, not `ArrowDown`, not ` ` --
 * Space activates the focused item in a menu, and treating it as a
 * character means the menu can never be used with the keyboard at all.
 * The one case worth stating: a space *inside* an ongoing search is
 * legitimate ("New Folder"), so it counts only when something is already
 * being typed.
 */
export function isTypeaheadKey(key: string, searching: boolean): boolean {
  if (key.length !== 1) return false
  if (key === ' ') return searching
  return true
}
