// The rules a tree needs that a flat list does not.
//
// Same terms as `./roving.ts` and `./typeahead.ts`: no `react`, no
// `document`. And this is where those two become usable for a tree at all,
// because of one observation that is easy to miss and decides the whole
// design:
//
//   Up and Down move through the *visible rows*, not through siblings.
//
// A tree is drawn as a list. Pressing Down on the last child of an
// expanded branch goes to the branch's next sibling -- a different parent,
// a different depth -- because that is the next line on the screen. So the
// tree is flattened to the rows it is currently showing, and from there it
// is a list: roving moves within it and typeahead searches it, unchanged.
//
// What is left over is the horizontal axis, which has no equivalent in a
// list: Right opens a branch or steps into it, Left closes one or steps
// out. Those four cases are `horizontalMove`.

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
 *
 * Collapsed branches contribute themselves and nothing under them, which
 * is what makes the result "what is on screen" rather than "everything".
 *
 * `aria-posinset` and `aria-setsize` are computed here rather than left to
 * the caller because they are about the *sibling* set, and by the time the
 * rows are flat that information is gone. A tree that omits them makes a
 * screen reader say "3 of 3" for every row it can see, which is worse than
 * silence: it is a wrong count rather than a missing one.
 */
export function visibleRows(
  nodes: readonly TreeNode[],
  expanded: ReadonlySet<string>,
): TreeRow[] {
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
 *
 * Four cases, and the two that get left out are the ones that make a
 * keyboard user's model of the tree match what they see:
 *
 *   Right on a closed branch  opens it
 *   Right on an open branch   steps to its first child
 *   Left on an open branch    closes it
 *   Left on anything else     steps to its parent
 *
 * Right on a leaf does nothing, and returns `null` so the key goes back to
 * the page rather than being swallowed.
 *
 * `rtl` swaps them, for the same reason `roving.ts` swaps its arrows: the
 * keys are about the screen, and a tree drawn right-to-left indents the
 * other way.
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
    // The first child is the next row: everything under an open branch is
    // drawn beneath it, so "step into" is "step down one".
    return active + 1 < rows.length ? { kind: 'focus', index: active + 1 } : null
  }

  if (row.branch && row.expanded) return { kind: 'collapse', id: row.id }
  if (row.parent === null) return null
  const parent = rows.findIndex((candidate) => candidate.id === row.parent)
  return parent === -1 ? null : { kind: 'focus', index: parent }
}
