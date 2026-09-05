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
  items: readonly HozoToolbarItem[]
  accessibilityLabel?: string
  style?: StyleProp<ViewStyle>
}

export function HozoToolbar({ items, accessibilityLabel, style }: HozoToolbarProps) {
  return (
    <View accessibilityRole="toolbar" accessibilityLabel={accessibilityLabel} style={style}>
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
