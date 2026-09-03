import { useRef } from 'react'

/** How long a keystroke stays part of the same search, in milliseconds. */
export const TYPEAHEAD_TIMEOUT_MS = 1000

/**
 * Derives the search string after `key`, given what was typed before and time elapsed.
 */
export function nextSearch(previous: string, key: string, sinceLastKey: number): string {
  const buffer = sinceLastKey > TYPEAHEAD_TIMEOUT_MS ? '' : previous
  return buffer + key.toLowerCase()
}

export interface TypeaheadOptions {
  /** The items' accessible labels in order. */
  labels: readonly string[]
  /** Which item currently has focus/active index. */
  active: number
  /** Items that cannot take focus, by index. */
  disabled?: readonly number[]
}

/**
 * Searches for the next matching index based on query string.
 * Supports consecutive single-letter cycling (e.g. pressing 's' repeatedly walks every 's' item).
 */
export function searchIndex(search: string, options: TypeaheadOptions): number | null {
  const { labels, active, disabled = [] } = options
  if (search === '' || labels.length === 0) return null

  const first = search.slice(0, 1)
  const repeated = search.length > 1 && [...search].every((character) => character === first)
  const needle = repeated ? first : search
  const from = repeated ? active + 1 : active

  for (let offset = 0; offset < labels.length; offset += 1) {
    const index = (from + offset + labels.length) % labels.length
    if (disabled.includes(index)) continue
    const label = labels[index]
    if (label?.trim().toLowerCase().startsWith(needle)) return index
  }
  return null
}

/**
 * Checks whether a keypress is printable search text rather than an action key.
 */
export function isTypeaheadKey(key: string, searching: boolean): boolean {
  if (key.length !== 1) return false
  if (key === ' ') return searching
  return true
}

/**
 * React Hook managing incremental typeahead search state.
 */
export function useTypeahead(
  labels: readonly string[],
  active: number,
  onSelect: (index: number) => void,
  disabled: readonly number[] = [],
) {
  const bufferRef = useRef('')
  const lastKeyTimeRef = useRef(0)

  const handleKeyDown = (event: { key: string; defaultPrevented?: boolean }) => {
    if (event.defaultPrevented) return
    const now = Date.now()
    const elapsed = now - lastKeyTimeRef.current
    const isSearching = elapsed <= TYPEAHEAD_TIMEOUT_MS && bufferRef.current.length > 0

    if (!isTypeaheadKey(event.key, isSearching)) return

    const query = nextSearch(bufferRef.current, event.key, elapsed)
    bufferRef.current = query
    lastKeyTimeRef.current = now

    const next = searchIndex(query, { labels, active, disabled })
    if (next !== null && next !== active) {
      onSelect(next)
    }
  }

  const reset = () => {
    bufferRef.current = ''
    lastKeyTimeRef.current = 0
  }

  return { handleKeyDown, reset }
}
