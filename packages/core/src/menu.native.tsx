import { type ReactNode, useState } from 'react'
import { Modal, Pressable, type StyleProp, View, type ViewStyle } from 'react-native'

export interface HozoMenuItem {
  label: string
  onSelect?: () => void
  disabled?: boolean
}

export interface HozoMenuProps {
  trigger: ReactNode
  items: readonly HozoMenuItem[]
  accessibilityLabel?: string
  style?: StyleProp<ViewStyle>
  triggerStyle?: StyleProp<ViewStyle>
  menuStyle?: StyleProp<ViewStyle>
  itemStyle?: StyleProp<ViewStyle>
}

export function HozoMenu({
  trigger,
  items,
  accessibilityLabel,
  style,
  triggerStyle,
  menuStyle,
  itemStyle,
}: HozoMenuProps) {
  const [open, setOpen] = useState(false)

  const select = (at: number) => {
    if (items[at]?.disabled) return
    items[at]?.onSelect?.()
    setOpen(false)
  }

  return (
    <View style={style}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={triggerStyle}
        onPress={() => setOpen(true)}
      >
        {trigger}
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
          style={menuStyle}
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
              style={itemStyle}
              onPress={() => select(at)}
            >
              {item.label}
            </Pressable>
          ))}
        </View>
      </Modal>
    </View>
  )
}

export { HozoMenu as Menu, type HozoMenuItem as MenuItem, type HozoMenuProps as MenuProps }
