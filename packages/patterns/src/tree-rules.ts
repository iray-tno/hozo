export interface TreeNode {
  /** Stable across renders; the caller's own identity for the row. */
  id: string
  label: string
  children?: readonly TreeNode[]
  disabled?: boolean
}

/** One row as it is drawn, with what a screen reader has to be told. */
export interface TreeRow {
  id: string
  label: string
  /** 1-based, which is what `aria-level` takes. */
  level: number
  /** Whether it has children at all -- a leaf gets no `aria-expanded`. */
  branch: boolean
  expanded: boolean
  disabled: boolean
  /** The row's parent, or `null` at the top. Left arrow needs it. */
  parent: string | null
  /** 1-based position among its siblings, for `aria-posinset`. */
  position: number
  /** How many siblings it has, for `aria-setsize`. */
  setSize: number
}

/**
 * The tree as the rows it is currently showing, top to bottom.
 */
export function visibleRows(nodes: readonly TreeNode[], expanded: ReadonlySet<string>): TreeRow[] {
  const rows: TreeRow[] = []
  const walk = (siblings: readonly TreeNode[], level: number, parent: string | null) => {
    siblings.forEach((node, at) => {
      const branch = (node.children?.length ?? 0) > 0
      const open = branch && expanded.has(node.id)
      rows.push({
        id: node.id,
        label: node.label,
        level,
        branch,
        expanded: open,
        disabled: node.disabled === true,
        parent,
        position: at + 1,
        setSize: siblings.length,
      })
      if (open && node.children) walk(node.children, level + 1, node.id)
    })
  }
  walk(nodes, 1, null)
  return rows
}

/** What the left and right arrows do to the row at `active`. */
export type TreeMove =
  | { kind: 'expand'; id: string }
  | { kind: 'collapse'; id: string }
  | { kind: 'focus'; index: number }
  | null

/**
 * Right and Left, which are the two keys a list has no answer for.
 */
export function horizontalMove(
  key: 'ArrowLeft' | 'ArrowRight',
  rows: readonly TreeRow[],
  active: number,
  rtl = false,
): TreeMove {
  const row = rows[active]
  if (!row) return null
  const opening = rtl ? key === 'ArrowLeft' : key === 'ArrowRight'

  if (opening) {
    if (!row.branch) return null
    if (!row.expanded) return { kind: 'expand', id: row.id }
    return active + 1 < rows.length ? { kind: 'focus', index: active + 1 } : null
  }

  if (row.branch && row.expanded) return { kind: 'collapse', id: row.id }
  if (row.parent === null) return null
  const parent = rows.findIndex((candidate) => candidate.id === row.parent)
  return parent === -1 ? null : { kind: 'focus', index: parent }
}
