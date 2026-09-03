import { type ReactNode, useCallback, useState } from 'react'
import { Pressable, type StyleProp, View, type ViewStyle } from 'react-native'

export interface HozoTab {
  label: ReactNode
  content: ReactNode
  disabled?: boolean
}

export interface HozoTabsProps {
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
