import { type ReactNode, useCallback, useState } from 'react'
import { Pressable, type StyleProp, View, type ViewStyle } from 'react-native'

export interface HozoTab {
  label: ReactNode
  content: ReactNode
  disabled?: boolean
}

export interface HozoTabsProps {
  /**
   * Tailwind classes, the same prop the Web half takes.
   *
   * On a tag the compiler lowers it is gone by runtime, replaced by a
   * `StyleSheet` entry. Anywhere else it is carried and ignored here --
   * this side has no CSS engine to resolve a class list against -- and
   * the type still has to accept it, because an app is type-checked
   * against the source the compiler reads rather than its output.
   */
  className?: string
  tabs: readonly HozoTab[]
  defaultIndex?: number
  index?: number
  onIndexChange?: (index: number) => void
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
            // Identified by position and nothing else: `defaultIndex`,
            // `onKeyDown(event, at)` and the roving `tabIndex` are all indices. A key
            // derived from anything else would be a second identity disagreeing with
            // the first -- which is the bug `option-key.ts` fixes for the two
            // components that select by value instead.
            // biome-ignore lint/suspicious/noArrayIndexKey: position is the identity here
            key={`tab-${at}`}
            accessibilityRole="tab"
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

export { type HozoTab as Tab, HozoTabs as Tabs }
