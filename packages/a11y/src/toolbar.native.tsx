// The React Native half of the toolbar.
//
// Almost nothing, and that is the honest answer rather than a stub. What
// the Web toolbar is *for* -- collapsing twelve tab stops into one -- is a
// problem created by a linear keyboard sequence, and React Native does not
// have one. A screen reader there swipes through elements one at a time
// and a toolbar's twelve buttons are twelve swipes whatever this does.
//
// So the group is the semantics: `toolbar`, and a name for it. The
// controls are the author's, unchanged, because there is no tab stop to
// hand out and no arrow key to bind.

import type { ReactNode } from 'react'
import { View, type StyleProp, type ViewStyle } from 'react-native'

export interface HozoToolbarItem {
  /**
   * The control.
   *
   * Takes the same argument as the Web side so an app can share the
   * function, and the argument is empty here: there is no tab stop and no
   * key handler to give it.
   */
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
        <View key={at}>{item.render({})}</View>
      ))}
    </View>
  )
}
