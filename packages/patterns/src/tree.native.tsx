import { hozoAuthoredStyle } from '@hozo/engine/generated/gap-styles'
import { hozoClasses } from '@hozo/engine/project'
import { type ReactNode, useCallback, useState } from 'react'
import {
  Pressable as NativePressable,
  type StyleProp,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native'
import { type InteractionState, Pressable } from './pressable.native.tsx'
import { splitTextStyle } from './text-style.native.ts'

import { rowPress, type TreeNode, type TreeToggleOn, visibleRows } from './tree-rules.ts'

export type { TreeNode }

/** What `rowLook` returns: class lists, read by the pattern on either platform. */
export interface HozoTreeRowLook {
  indentClassName?: string
  markerClassName?: string
}

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
  rowLook,
  toggleOn = 'row',
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
      style={[hozoClasses(className), hozoAuthoredStyle(style)]}
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
            style={(interaction) => [look(interaction)[0], hozoAuthoredStyle(rowStyle)]}
            // A press selects, and opens or closes a branch too unless the
            // marker is the toggle -- the same as the Web half, which this
            // half used to disagree with by toggling a branch and never
            // selecting it.
            onPress={() => {
              const outcome = rowPress(row, toggleOn)
              if (outcome.toggle) toggle(row.id)
              if (outcome.select) onSelect?.(row.id)
            }}
            // With the marker as the toggle, a screen reader cannot reach it
            // (it is hidden), so the row offers expand and collapse instead.
            accessibilityActions={
              row.branch && toggleOn === 'marker'
                ? [{ name: row.expanded ? 'collapse' : 'expand' }]
                : undefined
            }
            onAccessibilityAction={(event) => {
              const name = event.nativeEvent.actionName
              if (name === 'expand' || name === 'collapse') toggle(row.id)
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
                  toggle: () => toggle(row.id),
                })
              ) : rowLook ? (
                rowInside(
                  rowLook({ level: row.level, expanded: row.expanded, branch: row.branch }),
                  row.label,
                  look(interaction)[1],
                  toggleOn === 'marker' && row.branch && !row.disabled
                    ? () => toggle(row.id)
                    : undefined,
                )
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

function rowInside(look: HozoTreeRowLook, label: string, text: TextStyle, toggle?: () => void) {
  const marker = hozoClasses(look.markerClassName)
  return (
    <View style={hozoClasses(look.indentClassName)}>
      {look.markerClassName === undefined ? null : toggle ? (
        // Its own press, which the row's does not also receive.
        <NativePressable
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          style={marker}
          onPress={toggle}
        />
      ) : (
        <View accessible={false} importantForAccessibility="no-hide-descendants" style={marker} />
      )}
      <Text style={text}>{label}</Text>
    </View>
  )
}

export { HozoTree as Tree, type HozoTreeProps as TreeProps }
