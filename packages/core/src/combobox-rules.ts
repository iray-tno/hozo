/** How much the field completes on its own. */
export type Autocomplete = 'none' | 'list' | 'both'

export interface FilterOptions {
  /** What the user has typed. */
  query: string
  labels: readonly string[]
  match?: 'starts' | 'contains'
}

/**
 * The indices still showing, in their original order.
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
 * The field's value after completing `query` to `label`, or `null` to leave it alone.
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
    value: query + label.slice(query.length),
    selectionStart: query.length,
    selectionEnd: label.length,
  }
}

/**
 * Which option is current after a vertical key, as an index into the filtered list.
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
