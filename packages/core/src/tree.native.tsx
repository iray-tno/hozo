import { type ReactNode, useCallback, useState } from 'react'
import { Pressable, type StyleProp, View, type ViewStyle } from 'react-native'

import { type TreeNode, visibleRows } from './tree-rules.ts'

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
          accessibilityLabel={`${row.label}, level ${row.level}, ${row.position} of ${row.setSize}`}
          accessibilityState={{
            selected: row.id === selectedId,
            disabled: row.disabled,
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

export { HozoTree as Tree, type HozoTreeProps as TreeProps }
