// The React Native half of Hozo's tab strip.
//
// Same shape as the Web one, and one large difference that is the platform
// rather than the port: there are no arrow keys and there is no tab order,
// so `./roving.ts` has nothing to decide here. What roving tabindex buys on
// Web -- a group that is one stop in a linear keyboard sequence -- is a
// problem React Native does not have, because a screen reader there moves
// by swiping through elements and the strip is already just a row.
//
// So this is the semantics and nothing else: `tablist`, `tab`, and which
// one is selected. That asymmetry is worth stating rather than hiding
// behind a shared abstraction -- the two platforms agree about what a tab
// strip *is* and disagree completely about how someone reaches one.
//
// `accessibilityRole="tab"` is React Native's own, and `selected` in
// `accessibilityState` is what VoiceOver and TalkBack announce. Both are
// the platform's spelling of what the Web side writes as `role="tab"` and
// `aria-selected`.

import { type ReactNode, useCallback, useState } from 'react'
import { Pressable, type StyleProp, View, type ViewStyle } from 'react-native'

export interface HozoTab {
  label: ReactNode
  content: ReactNode
  /**
   * Unavailable, but still present and still announced.
   *
   * Not removed, for the same reason as on Web: removing it renumbers the
   * others and moves what someone was pointing at.
   */
  disabled?: boolean
}

export interface HozoTabsProps {
  tabs: readonly HozoTab[]
  defaultIndex?: number
  index?: number
  onIndexChange?: (index: number) => void
  /** The strip's accessible name. */
  accessibilityLabel?: string
  style?: StyleProp<ViewStyle>
  tabListStyle?: StyleProp<ViewStyle>
  tabStyle?: StyleProp<ViewStyle>
  panelStyle?: StyleProp<ViewStyle>
}

export function HozoTabs({
  tabs,
  defaultIndex = 0,
  index,
  onIndexChange,
  accessibilityLabel,
  style,
  tabListStyle,
  tabStyle,
  panelStyle,
}: HozoTabsProps) {
  const [uncontrolled, setUncontrolled] = useState(defaultIndex)
  const selected = index ?? uncontrolled

  const select = useCallback(
    (at: number) => {
      if (tabs[at]?.disabled) return
      if (index === undefined) setUncontrolled(at)
      onIndexChange?.(at)
    },
    [index, onIndexChange, tabs],
  )

  return (
    <View style={style}>
      <View
        accessibilityRole="tablist"
        accessibilityLabel={accessibilityLabel}
        style={tabListStyle}
      >
        {tabs.map((tab, at) => (
          <Pressable
            key={at}
            accessibilityRole="tab"
            // `disabled` as a state rather than as a prop, so the tab keeps
            // its place in the strip and is still announced. React Native's
            // `disabled` prop would take it out of the accessibility tree,
            // which is the same hole `aria-disabled` avoids on Web.
            accessibilityState={{ selected: at === selected, disabled: tab.disabled }}
            style={tabStyle}
            onPress={() => select(at)}
          >
            {tab.label}
          </Pressable>
        ))}
      </View>
      <View style={panelStyle}>{tabs[selected]?.content ?? null}</View>
    </View>
  )
}
