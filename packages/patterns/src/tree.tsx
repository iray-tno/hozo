import { isTypeaheadKey, nextIndex, nextSearch, type RovingKey, searchIndex } from '@hozo/behaviors'
import { type KeyboardEvent, type ReactNode, useCallback, useRef, useState } from 'react'

import {
  horizontalMove,
  rowPress,
  type TreeNode,
  type TreeToggleOn,
  visibleRows,
} from './tree-rules.ts'

export type { TreeNode }

/** What `rowLook` returns: class lists, read by the pattern on either platform. */
export interface HozoTreeRowLook {
  indentClassName?: string
  markerClassName?: string
}

export interface HozoTreeProps {
  nodes: readonly TreeNode[]
  defaultExpanded?: readonly string[]
  selectedId?: string
  onSelect?: (id: string) => void
  accessibilityLabel?: string
  className?: string
  rowClassName?: string
  /**
   * The row's inside, when the default label is not enough.
   *
   * `branch` is what tells a closed branch from a leaf: `expanded` is false
   * for both, so a renderer given only that draws no marker on a folder
   * nobody has opened yet -- which is how this package's own demo ended up
   * with closed branches indistinguishable from files.
   */
  renderRow?: (row: {
    id: string
    label: string
    level: number
    expanded: boolean
    branch: boolean
    /** Opens or closes this branch: for a marker drawn by `renderRow`. */
    toggle: () => void
  }) => ReactNode
  /**
   * The row's inside as a look, for a caller who wants a marker and an
   * indent without taking the row over.
   *
   * The pattern draws them: an inner element with `indentClassName`, a
   * decorative marker with `markerClassName` hidden from assistive
   * technology (a glyph in the label would be in the accessible name), and
   * the label, which keeps the row's own text styles on React Native -- what
   * a `renderRow` cannot do there, since the row's resolved text style never
   * reaches it. Real elements rather than `::before`, so the marker exists
   * on a platform without pseudo-elements (#983). `renderRow` wins if both
   * are given.
   */
  rowLook?: (row: { level: number; expanded: boolean; branch: boolean }) => HozoTreeRowLook
  /**
   * What a pointer presses to open or close a branch (#1143).
   *
   * `row`, the default: the whole row, which also selects it. That suits a
   * marker that points, a chevron or a triangle, which reads as "this row
   * opens".
   *
   * `marker`: only the marker, and a press anywhere else on the row only
   * selects it. That suits a `+` box, which reads as a control of its own,
   * and a tree whose branches are things to choose -- a navigation tree or a
   * settings section -- where opening one should not be a side effect of
   * choosing it. Give the marker a target of at least 24px in the look.
   *
   * The keyboard is the same either way: Left and Right open and close,
   * Enter and Space select.
   */
  toggleOn?: TreeToggleOn
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
  rowLook,
  toggleOn = 'row',
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

  const press = (row: (typeof rows)[number]) => {
    const outcome = rowPress(row, toggleOn)
    if (outcome.toggle) setOpen(row.id, !row.expanded)
    if (outcome.select) onSelect?.(row.id)
  }

  const move = (at: number) => {
    setActive(at)
    refs.current[at]?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>, at: number) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const rtl = readDirection(event.currentTarget) === 'rtl'
      const action = horizontalMove(event.key, rows, at, rtl)
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
          data-hozo-pressable=""
          aria-level={row.level}
          aria-posinset={row.position}
          aria-setsize={row.setSize}
          aria-expanded={row.branch ? row.expanded : undefined}
          aria-selected={row.id === selectedId}
          aria-disabled={row.disabled || undefined}
          tabIndex={at === stop ? 0 : -1}
          className={rowClassName}
          onKeyDown={(event) => onKeyDown(event, at)}
          onFocus={() => setActive(at)}
          onClick={() => press(row)}
        >
          {renderRow
            ? renderRow({
                id: row.id,
                label: row.label,
                level: row.level,
                expanded: row.expanded,
                branch: row.branch,
                toggle: () => setOpen(row.id, !row.expanded),
              })
            : rowLook
              ? rowInside(
                  rowLook({ level: row.level, expanded: row.expanded, branch: row.branch }),
                  row.label,
                  toggleOn === 'marker' && row.branch && !row.disabled
                    ? () => setOpen(row.id, !row.expanded)
                    : undefined,
                )
              : row.label}
        </div>
      ))}
    </div>
  )
}

function rowInside(look: HozoTreeRowLook, label: string, toggle?: () => void) {
  return (
    <span className={look.indentClassName}>
      {look.markerClassName === undefined ? null : (
        // Still hidden and not a tab stop when it toggles: the keyboard opens
        // a branch with the arrows, so this is a target for a pointer only.
        // The row's own click would select as well, so it stops here.
        <span
          aria-hidden="true"
          className={look.markerClassName}
          onClick={
            toggle
              ? (event) => {
                  event.stopPropagation()
                  toggle()
                }
              : undefined
          }
        />
      )}
      <span>{label}</span>
    </span>
  )
}

function readDirection(element: Element): string {
  if (typeof window === 'undefined') return 'ltr'
  return window.getComputedStyle(element).direction || 'ltr'
}

export { HozoTree as Tree, type HozoTreeProps as TreeProps }
