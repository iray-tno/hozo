import { hozoClasses } from '@hozo/engine/project'
import { type ReactNode, useCallback, useState } from 'react'
import { type StyleProp, Text, View, type ViewStyle } from 'react-native'
import { type InteractionState, Pressable } from './pressable.native.tsx'
import { splitTextStyle } from './text-style.native.ts'

import { type TreeNode, visibleRows } from './tree-rules.ts'

export type { TreeNode }

export interface HozoTreeProps {
  /**
   * Tailwind classes, the same prop the Web half takes.
   *
   * On a tag the compiler lowers it is gone by runtime, replaced by a
   * `StyleSheet` entry. Here it arrives as a string and is resolved through
   * the project's candidate map (#886), a row with its interaction, `aria-selected`,
   * `aria-expanded` and `disabled` state. A string label takes the text half
   * of its row's styles. Each `*Style` prop comes after its class list.
   */
  className?: string
  /** The class list for each row, resolved like `className`. */
  rowClassName?: string
  nodes: readonly TreeNode[]
  defaultExpanded?: readonly string[]
  selectedId?: string
  onSelect?: (id: string) => void
  accessibilityLabel?: string
  style?: StyleProp<ViewStyle>
  rowStyle?: StyleProp<ViewStyle>
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
  }) => ReactNode
}

export function HozoTree({
  className,
  rowClassName,
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
    <View
      accessibilityRole="list"
      accessibilityLabel={accessibilityLabel}
      style={[hozoClasses(className), style]}
    >
      {rows.map((row) => {
        const look = (interaction: InteractionState) =>
          splitTextStyle(
            hozoClasses(rowClassName, {
              ...interaction,
              disabled: Boolean(row.disabled),
              'aria-selected': row.id === selectedId,
              'aria-expanded': row.branch && row.expanded,
              'aria-disabled': Boolean(row.disabled),
            }),
          )
        return (
          <Pressable
            key={row.id}
            accessibilityRole="menuitem"
            accessibilityLabel={`${row.label}, level ${row.level}, ${row.position} of ${row.setSize}`}
            accessibilityState={{
              selected: row.id === selectedId,
              disabled: row.disabled,
              expanded: row.branch ? row.expanded : undefined,
            }}
            disabled={row.disabled}
            style={(interaction) => [look(interaction)[0], rowStyle]}
            onPress={() => {
              if (row.disabled) return
              if (row.branch) toggle(row.id)
              else onSelect?.(row.id)
            }}
          >
            {(interaction) =>
              renderRow ? (
                renderRow({
                  id: row.id,
                  label: row.label,
                  level: row.level,
                  expanded: row.expanded,
                  branch: row.branch,
                })
              ) : (
                <Text style={look(interaction)[1]}>{row.label}</Text>
              )
            }
          </Pressable>
        )
      })}
    </View>
  )
}

export { HozoTree as Tree, type HozoTreeProps as TreeProps }
