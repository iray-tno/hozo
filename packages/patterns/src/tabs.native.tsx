import { hozoTextChildren } from '@hozo/behaviors'
import { hozoAuthoredStyle } from '@hozo/engine/generated/gap-styles'
import { hozoClasses } from '@hozo/engine/project'
import { type ReactNode, useCallback, useState } from 'react'
import { type StyleProp, Text, type TextStyle, View, type ViewStyle } from 'react-native'
import { type InteractionState, Pressable } from './pressable.native.tsx'
import { splitTextStyle } from './text-style.native.ts'

export interface HozoTab {
  label: ReactNode
  content: ReactNode
  disabled?: boolean
}

type TabOwnerState = Readonly<
  InteractionState & {
    disabled: boolean
    'aria-selected': boolean
    'aria-disabled': boolean
  }
>

export interface HozoTabsProps {
  /**
   * Tailwind classes, the same prop the Web half takes.
   *
   * On a tag the compiler lowers it is gone by runtime, replaced by a
   * `StyleSheet` entry. Here it arrives as a string and is resolved through
   * the project's candidate map (`@hozo/engine/project`, which `withHozo`
   * points at it), with the state each element is in -- a tab's `pressed`,
   * `aria-selected` and `disabled` (#886). Each `*Style` prop comes after
   * its class list, so an explicit style still wins.
   */
  className?: string
  /** Class lists for the parts, resolved like `className`. */
  tabListClassName?: string
  tabClassName?: string
  panelClassName?: string
  /** Shared author prop; Native focus order does not use the Web arrow-key axis. */
  orientation?: 'horizontal' | 'vertical' | 'both'
  tabs: readonly HozoTab[]
  defaultIndex?: number
  index?: number
  onIndexChange?: (index: number) => void
  accessibilityLabel?: string
  style?: StyleProp<ViewStyle>
  tabListStyle?: StyleProp<ViewStyle>
  tabStyle?: StyleProp<ViewStyle>
  /**
   * @internal Complete prepared tab class contribution (RFC010).
   * Each existing Pressable supplies its own live facts. A producer consumes
   * tabClassName, including any residual, rather than applying both routes.
   * Ordinary compiler output does not emit this experimental carrier yet.
   */
  hozoTabStyle?: (state: TabOwnerState) => StyleProp<ViewStyle | TextStyle>
  panelStyle?: StyleProp<ViewStyle>
}

export function HozoTabs({
  className,
  tabListClassName,
  tabClassName,
  panelClassName,
  tabs,
  defaultIndex = 0,
  index,
  onIndexChange,
  accessibilityLabel,
  style,
  tabListStyle,
  tabStyle,
  hozoTabStyle,
  panelStyle,
}: HozoTabsProps) {
  if (hozoTabStyle && tabClassName !== undefined)
    throw new Error('Prepared Tabs tab styles must consume tabClassName')
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

  // A tab's box and label: a Pressable is a View and drops a label's colour
  // and weight, so those go to its Text (see `splitTextStyle`).
  const look = (tab: HozoTab, at: number, interaction: InteractionState) => {
    // A disposable snapshot, not shared interaction/strip state. The same
    // facts drive both routes, before the existing box/label split.
    const facts: TabOwnerState = {
      ...interaction,
      disabled: Boolean(tab.disabled),
      'aria-selected': at === selected,
      'aria-disabled': Boolean(tab.disabled),
    }
    return splitTextStyle(hozoTabStyle ? hozoTabStyle(facts) : hozoClasses(tabClassName, facts))
  }

  // The panel's box and its text, split for the same reason as a tab's.
  const [panelBox, panelText] = splitTextStyle([
    hozoClasses(panelClassName),
    hozoAuthoredStyle(panelStyle),
  ])

  return (
    <View style={[hozoClasses(className), hozoAuthoredStyle(style)]}>
      <View
        accessibilityRole="tablist"
        accessibilityLabel={accessibilityLabel}
        style={[hozoClasses(tabListClassName), hozoAuthoredStyle(tabListStyle)]}
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
            disabled={tab.disabled}
            style={(interaction) => [look(tab, at, interaction)[0], hozoAuthoredStyle(tabStyle)]}
            onPress={() => select(at)}
          >
            {(interaction) =>
              typeof tab.label === 'string' ? (
                <Text style={look(tab, at, interaction)[1]}>{tab.label}</Text>
              ) : (
                tab.label
              )
            }
          </Pressable>
        ))}
      </View>
      <View style={panelBox}>{hozoTextChildren(tabs[selected]?.content ?? null, panelText)}</View>
    </View>
  )
}

export { type HozoTab as Tab, HozoTabs as Tabs }
