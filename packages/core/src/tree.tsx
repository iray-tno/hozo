import { isTypeaheadKey, nextIndex, nextSearch, type RovingKey, searchIndex } from '@hozo/behaviors'
import { type KeyboardEvent, type ReactNode, useCallback, useRef, useState } from 'react'

import { horizontalMove, type TreeNode, visibleRows } from './tree-rules.ts'

export type { TreeNode }

export interface HozoTreeProps {
  nodes: readonly TreeNode[]
  defaultExpanded?: readonly string[]
  selectedId?: string
  onSelect?: (id: string) => void
  accessibilityLabel?: string
  className?: string
  rowClassName?: string
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

function readDirection(element: Element): string {
  if (typeof window === 'undefined') return 'ltr'
  return window.getComputedStyle(element).direction || 'ltr'
}

export { HozoTree as Tree, type HozoTreeProps as TreeProps }
