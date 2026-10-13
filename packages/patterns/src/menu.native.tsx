import { hozoClasses } from '@hozo/engine/project'
import { type ReactNode, useState } from 'react'
import { Modal, Pressable, type StyleProp, Text, View, type ViewStyle } from 'react-native'
import { splitTextStyle } from './text-style.native.ts'

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
   * the project's candidate map (#886): the trigger with its `pressed` and
   * `aria-expanded` state, an item with `pressed` and `disabled`. A string
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
  style?: StyleProp<ViewStyle>
  triggerStyle?: StyleProp<ViewStyle>
  menuStyle?: StyleProp<ViewStyle>
  itemStyle?: StyleProp<ViewStyle>
}

export function HozoMenu({
  className,
  triggerClassName,
  menuClassName,
  itemClassName,
  trigger,
  items,
  accessibilityLabel,
  style,
  triggerStyle,
  menuStyle,
  itemStyle,
}: HozoMenuProps) {
  const [open, setOpen] = useState(false)

  const triggerLook = (pressed: boolean) =>
    splitTextStyle(hozoClasses(triggerClassName, { pressed, 'aria-expanded': open }))
  const itemLook = (pressed: boolean, disabled?: boolean) =>
    splitTextStyle(
      hozoClasses(itemClassName, {
        pressed,
        disabled: Boolean(disabled),
        'aria-disabled': Boolean(disabled),
      }),
    )

  const select = (at: number) => {
    if (items[at]?.disabled) return
    items[at]?.onSelect?.()
    setOpen(false)
  }

  return (
    <View style={[hozoClasses(className), style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [triggerLook(pressed)[0], triggerStyle]}
        onPress={() => setOpen(true)}
      >
        {({ pressed }) =>
          typeof trigger === 'string' ? (
            <Text style={triggerLook(pressed)[1]}>{trigger}</Text>
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
          style={[hozoClasses(menuClassName), menuStyle]}
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
              style={({ pressed }) => [itemLook(pressed, item.disabled)[0], itemStyle]}
              onPress={() => select(at)}
            >
              {({ pressed }) =>
                typeof item.label === 'string' ? (
                  <Text style={itemLook(pressed, item.disabled)[1]}>{item.label}</Text>
                ) : (
                  item.label
                )
              }
            </Pressable>
          ))}
        </View>
      </Modal>
    </View>
  )
}

export { HozoMenu as Menu, type HozoMenuItem as MenuItem, type HozoMenuProps as MenuProps }
