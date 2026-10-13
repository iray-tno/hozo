import { hozoClasses } from '@hozo/engine/project'
import type { ReactNode } from 'react'
import { type StyleProp, View, type ViewStyle } from 'react-native'

/**
 * What a toolbar item's `render` is handed here: nothing.
 *
 * The Web half passes the roving-focus wiring -- `tabIndex`, `onKeyDown`,
 * `onFocus`, `ref` -- because a toolbar there is one tab stop with arrow
 * keys inside it, and each item has to take part. React Native has no tab
 * order to rove through: every touchable is reachable, and the platform's
 * own focus order is what a screen reader walks. So the shape is empty
 * rather than absent, which keeps one name across the two.
 */
export type HozoToolbarItemProps = Record<string, never>

export interface HozoToolbarItem {
  render: (props: HozoToolbarItemProps) => ReactNode
  disabled?: boolean
}

export interface HozoToolbarProps {
  /**
   * Tailwind classes, the same prop the Web half takes.
   *
   * On a tag the compiler lowers it is gone by runtime, replaced by a
   * `StyleSheet` entry. Here it arrives as a string and is resolved through
   * the project's candidate map (#886), with the state of the element it
   * styles. Each `*Style` prop comes after its class list.
   */
  className?: string
  /** Shared author prop; Native focus order does not use the Web arrow-key axis. */
  orientation?: 'horizontal' | 'vertical' | 'both'
  items: readonly HozoToolbarItem[]
  accessibilityLabel?: string
  style?: StyleProp<ViewStyle>
}

export function HozoToolbar({ className, items, accessibilityLabel, style }: HozoToolbarProps) {
  return (
    <View
      accessibilityRole="toolbar"
      accessibilityLabel={accessibilityLabel}
      style={[hozoClasses(className), style]}
    >
      {items.map((item, at) => (
        // Identified by position and nothing else: `defaultIndex`,
        // `onKeyDown(event, at)` and the roving `tabIndex` are all indices. A key
        // derived from anything else would be a second identity disagreeing with
        // the first -- which is the bug `option-key.ts` fixes for the two
        // components that select by value instead.
        // biome-ignore lint/suspicious/noArrayIndexKey: position is the identity here
        <View key={`item-${at}`}>{item.render({})}</View>
      ))}
    </View>
  )
}

export {
  HozoToolbar as Toolbar,
  type HozoToolbarItem as ToolbarItem,
  type HozoToolbarProps as ToolbarProps,
}
