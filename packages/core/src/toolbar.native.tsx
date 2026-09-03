import type { ReactNode } from 'react'
import { type StyleProp, View, type ViewStyle } from 'react-native'

export interface HozoToolbarItem {
  render: (props: Record<string, never>) => ReactNode
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
