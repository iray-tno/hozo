import { useHozoProvidedSafeArea } from '@hozo/engine/generated/safe-area'
import { hozoClasses } from '@hozo/engine/project'
import { type ReactNode, useState } from 'react'
import { Modal, type StyleProp, Text, type TextStyle, View, type ViewStyle } from 'react-native'
import { nonControlSlotFacts } from './non-control-facts.native.ts'
import { type InteractionState, Pressable } from './pressable.native.tsx'
import type { MenuItemSlotFacts, MenuTriggerSlotFacts } from './slot-facts.native.ts'
import { splitTextStyle } from './text-style.native.ts'

type Style = StyleProp<ViewStyle | TextStyle>
type TriggerState = InteractionState & MenuTriggerSlotFacts
type ItemState = InteractionState & MenuItemSlotFacts

export interface HozoMenuItem {
  label: string
  onSelect?: () => void
  disabled?: boolean
}

export interface HozoMenuProps {
  /**
   * Tailwind classes, the same prop the Web half takes.
   *
   * On a tag the compiler lowers it is gone by runtime, replaced by a
   * `StyleSheet` entry. Here it arrives as a string and is resolved through
   * the project's candidate map (#886): the trigger with its interaction and
   * `aria-expanded` state, an item with interaction and `aria-disabled`. The
   * Web item is a div, not a disabled/enabled form control. A string
   * label takes the text half. Each `*Style` prop comes after its class list.
   */
  className?: string
  /** Class lists for the parts, resolved like `className`. */
  triggerClassName?: string
  menuClassName?: string
  itemClassName?: string
  trigger: ReactNode
  items: readonly HozoMenuItem[]
  accessibilityLabel?: string
  /**
   * Open on mount, as `Popover`'s and `Tooltip`'s are, with the first item
   * that can be chosen active. For a screen that starts with the menu showing,
   * and for an audit that has to read the menu rather than its button.
   */
  defaultOpen?: boolean
  style?: Style
  triggerStyle?: Style
  menuStyle?: Style
  itemStyle?: Style
  /** @internal The real button owns focus, pointer and expanded state. */
  hozoTriggerStyle?: (state: TriggerState) => Style
  /** @internal Action divs own their focus, pointer and aria-disabled state. */
  hozoItemStyle?: (state: ItemState) => Style
}

export function HozoMenu({
  className,
  triggerClassName,
  menuClassName,
  itemClassName,
  trigger,
  items,
  accessibilityLabel,
  defaultOpen = false,
  style,
  triggerStyle,
  menuStyle,
  itemStyle,
  hozoTriggerStyle,
  hozoItemStyle,
}: HozoMenuProps) {
  const [open, setOpen] = useState(defaultOpen)
  const insets = useHozoProvidedSafeArea()

  const [rootBox, rootText] = splitTextStyle([hozoClasses(className, nonControlSlotFacts), style])
  const [menuBox, menuText] = splitTextStyle([
    rootText,
    hozoClasses(menuClassName, nonControlSlotFacts),
    menuStyle,
  ])
  const triggerLook = (interaction: InteractionState) => {
    const facts = {
      ...interaction,
      ...nonControlSlotFacts,
      enabled: true,
      'aria-expanded': open,
    } satisfies TriggerState
    return splitTextStyle([
      rootText,
      hozoClasses(triggerClassName, facts),
      hozoTriggerStyle?.(facts),
      triggerStyle,
    ])
  }
  const itemLook = (interaction: InteractionState, disabled?: boolean) => {
    const facts = {
      ...interaction,
      ...nonControlSlotFacts,
      'aria-disabled': Boolean(disabled),
    } satisfies ItemState
    return splitTextStyle([
      menuText,
      hozoClasses(itemClassName, facts),
      hozoItemStyle?.(facts),
      itemStyle,
    ])
  }

  const select = (at: number) => {
    if (items[at]?.disabled) return
    items[at]?.onSelect?.()
    setOpen(false)
  }

  return (
    <View style={rootBox}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={(interaction) => triggerLook(interaction)[0]}
        onPress={() => setOpen(true)}
      >
        {(interaction) =>
          typeof trigger === 'string' ? (
            <Text style={triggerLook(interaction)[1]}>{trigger}</Text>
          ) : (
            trigger
          )
        }
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ flex: 1 }}
          onPress={() => setOpen(false)}
        />
        <View
          accessibilityViewIsModal
          accessibilityRole="menu"
          accessibilityLabel={accessibilityLabel}
          style={menuBox}
        >
          {items.map((item, at) => (
            <Pressable
              // Identified by position and nothing else: `defaultIndex`,
              // `onKeyDown(event, at)` and the roving `tabIndex` are all indices. A key
              // derived from anything else would be a second identity disagreeing with
              // the first -- which is the bug `option-key.ts` fixes for the two
              // components that select by value instead.
              // biome-ignore lint/suspicious/noArrayIndexKey: position is the identity here
              key={`item-${at}`}
              accessibilityRole="menuitem"
              accessibilityState={{ disabled: item.disabled }}
              disabled={item.disabled}
              style={(interaction) => itemLook(interaction, item.disabled)[0]}
              onPress={() => select(at)}
            >
              {(interaction) =>
                typeof item.label === 'string' ? (
                  <Text style={itemLook(interaction, item.disabled)[1]}>{item.label}</Text>
                ) : (
                  item.label
                )
              }
            </Pressable>
          ))}
          {/*
            The sheet is pinned to the bottom edge by this component, not by a
            class, so clearing the home indicator and the gesture handle is
            this component's job too. A spacer rather than padding, so the
            inset adds to whatever padding the menu's class list gives it.
          */}
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{ height: insets.bottom }}
          />
        </View>
      </Modal>
    </View>
  )
}

export { HozoMenu as Menu, type HozoMenuItem as MenuItem, type HozoMenuProps as MenuProps }
