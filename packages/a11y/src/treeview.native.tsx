// The React Native half of the tree.
//
// `./tree.ts` still does the work, and this is the one place that is worth
// pointing at: the flattening is not a Web technique. A tree renders as a
// list of visible rows on both platforms, and on Native there is no other
// option -- there is no nesting a screen reader reads as depth, so the
// depth has to be *said*.
//
// React Native has no `aria-level`, no `aria-posinset`, no
// `aria-setsize`. What it has is `accessibilityLabel`, so the position in
// the tree goes into the label: "lib, level 2, 2 of 2". Ugly written down
// and correct when heard, and the alternative is a tree that announces as
// a flat list with mysterious indentation nobody can perceive.

import { type ReactNode, useCallback, useState } from 'react'
import { Pressable, type StyleProp, View, type ViewStyle } from 'react-native'

import { type TreeNode, visibleRows } from './tree.ts'

export type { TreeNode }

export interface HozoTreeProps {
  nodes: readonly TreeNode[]
  defaultExpanded?: readonly string[]
  selectedId?: string
  onSelect?: (id: string) => void
  accessibilityLabel?: string
  style?: StyleProp<ViewStyle>
  rowStyle?: StyleProp<ViewStyle>
  renderRow?: (row: { id: string; label: string; level: number; expanded: boolean }) => ReactNode
}

export function HozoTree({
  nodes,
  defaultExpanded = [],
  selectedId,
  onSelect,
  accessibilityLabel,
  style,
  rowStyle,
  renderRow,
}: HozoTreeProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set(defaultExpanded))
  const rows = visibleRows(nodes, expanded)

  const toggle = useCallback((id: string) => {
    setExpanded((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  return (
    <View accessibilityRole="list" accessibilityLabel={accessibilityLabel} style={style}>
      {rows.map((row) => (
        <Pressable
          key={row.id}
          accessibilityRole="menuitem"
          // The depth said out loud, because there is nothing structural
          // here for it to be read from.
          accessibilityLabel={`${row.label}, level ${row.level}, ${row.position} of ${row.setSize}`}
          accessibilityState={{
            selected: row.id === selectedId,
            disabled: row.disabled,
            // Only a branch has a state to be in; a leaf announcing
            // "collapsed" says it can be opened, which it cannot.
            expanded: row.branch ? row.expanded : undefined,
          }}
          style={rowStyle}
          onPress={() => {
            if (row.disabled) return
            if (row.branch) toggle(row.id)
            else onSelect?.(row.id)
          }}
        >
          {renderRow
            ? renderRow({ id: row.id, label: row.label, level: row.level, expanded: row.expanded })
            : row.label}
        </Pressable>
      ))}
    </View>
  )
}
