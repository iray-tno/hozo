// A tree.
//
// The rules are in `./tree.ts`: the tree flattens to the rows it is
// showing, and from there Up and Down are `./roving.ts` and typing is
// `./typeahead.ts`, both unchanged. Left and Right are the only keys a
// list has no answer for, and `horizontalMove` is those four cases.
//
// What is left here is the wiring, and the three attributes that carry the
// shape a sighted reader gets from the indentation: `aria-level`,
// `aria-posinset` and `aria-setsize`. Without them the tree renders
// identically and announces as a flat list -- the depth is in the CSS, and
// CSS is exactly what a screen reader does not read.

import { type KeyboardEvent, type ReactNode, useCallback, useRef, useState } from 'react'

import { nextIndex, type RovingKey } from './roving.ts'
import { horizontalMove, type TreeNode, visibleRows } from './tree.ts'
import { isTypeaheadKey, nextSearch, searchIndex } from './typeahead.ts'

export type { TreeNode }

export interface HozoTreeProps {
  nodes: readonly TreeNode[]
  /** Which branches start open. */
  defaultExpanded?: readonly string[]
  /** The selected row's id, when the caller owns it. */
  selectedId?: string
  onSelect?: (id: string) => void
  /** The tree's accessible name. */
  accessibilityLabel?: string
  className?: string
  rowClassName?: string
  /** Renders one row's label. The indentation is the caller's to draw. */
  renderRow?: (row: { id: string; label: string; level: number; expanded: boolean }) => ReactNode
}

export function HozoTree({
  nodes,
  defaultExpanded = [],
  selectedId,
  onSelect,
  accessibilityLabel,
  className,
  rowClassName,
  renderRow,
}: HozoTreeProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set(defaultExpanded))
  const [active, setActive] = useState(0)
  const refs = useRef<(HTMLDivElement | null)[]>([])
  const search = useRef({ text: '', at: 0 })

  const rows = visibleRows(nodes, expanded)
  const disabled = rows.flatMap((row, at) => (row.disabled ? [at] : []))
  const labels = rows.map((row) => row.label)

  const setOpen = useCallback((id: string, open: boolean) => {
    setExpanded((previous) => {
      const next = new Set(previous)
      if (open) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const move = (at: number) => {
    setActive(at)
    refs.current[at]?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>, at: number) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const rtl = readDirection(event.currentTarget) === 'rtl'
      const action = horizontalMove(event.key, rows, at, rtl)
      // `null` means this row has nowhere to go -- a leaf, or the top of
      // the tree -- and the key goes back to the page rather than being
      // swallowed for nothing.
      if (action === null) return
      event.preventDefault()
      if (action.kind === 'focus') move(action.index)
      else setOpen(action.id, action.kind === 'expand')
      return
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      const row = rows[at]
      if (row && !row.disabled) onSelect?.(row.id)
      return
    }

    const moved = nextIndex(event.key as RovingKey, {
      count: rows.length,
      active: at,
      orientation: 'vertical',
      disabled,
    })
    if (moved !== null) {
      event.preventDefault()
      move(moved)
      return
    }

    if (isTypeaheadKey(event.key, search.current.text !== '')) {
      const now = Date.now()
      const text = nextSearch(search.current.text, event.key, now - search.current.at)
      search.current = { text, at: now }
      const found = searchIndex(text, { labels, active: at, disabled })
      if (found !== null) {
        event.preventDefault()
        move(found)
      }
    }
  }

  // One tab stop for the whole tree, on the selected row when there is one
  // -- the same reasoning as the radio group and the single-select
  // listbox: Tab in should land on the current answer.
  const selectedAt = rows.findIndex((row) => row.id === selectedId)
  const stop = selectedAt !== -1 ? selectedAt : Math.min(active, Math.max(rows.length - 1, 0))

  return (
    <div role="tree" aria-label={accessibilityLabel} className={className}>
      {rows.map((row, at) => (
        <div
          key={row.id}
          ref={(node) => {
            refs.current[at] = node
          }}
          role="treeitem"
          // The shape a sighted reader gets from the indentation. Leaving
          // these off renders the same tree and announces a flat list.
          aria-level={row.level}
          aria-posinset={row.position}
          aria-setsize={row.setSize}
          // Only a branch has a state to be in. `aria-expanded` on a leaf
          // tells a screen reader it can be opened, which it cannot.
          aria-expanded={row.branch ? row.expanded : undefined}
          aria-selected={row.id === selectedId}
          aria-disabled={row.disabled || undefined}
          tabIndex={at === stop ? 0 : -1}
          className={rowClassName}
          onKeyDown={(event) => onKeyDown(event, at)}
          onFocus={() => setActive(at)}
          onClick={() => !row.disabled && onSelect?.(row.id)}
        >
          {renderRow
            ? renderRow({ id: row.id, label: row.label, level: row.level, expanded: row.expanded })
            : row.label}
        </div>
      ))}
    </div>
  )
}

/** The effective writing direction at `element`. */
function readDirection(element: Element): string {
  if (typeof window === 'undefined') return 'ltr'
  return window.getComputedStyle(element).direction || 'ltr'
}
