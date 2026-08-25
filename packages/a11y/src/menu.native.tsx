// The React Native half of the menu button.
//
// The same asymmetry the tab strip has, and larger here. Half of what
// makes the Web menu a menu -- one tab stop, arrow keys, typeahead,
// returning focus to the button -- is about a linear keyboard sequence,
// and React Native has none. A screen reader there swipes through
// elements, so the menu is reachable the moment it is on screen and the
// roving rules have nothing to decide.
//
// What does not change is that it is a modal thing: while the menu is open
// the content behind it is not available, and the platform has to be told
// so or VoiceOver will keep reading the screen underneath. That is
// `Modal` with `accessibilityViewIsModal`, the same delegation
// `./dialog.native.tsx` makes and for the same reason.

import { useState, type ReactNode } from 'react'
import { Modal, Pressable, View, type StyleProp, type ViewStyle } from 'react-native'

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
        // React Native has no `aria-haspopup`, and `expanded` is the part
        // of it a screen reader actually announces here.
        accessibilityState={{ expanded: open }}
        style={triggerStyle}
        onPress={() => setOpen(true)}
      >
        {trigger}
      </Pressable>
      <Modal
        visible={open}
        transparent
        animationType="fade"
        // Android's hardware back button. Required by React Native on that
        // platform, and the same reason the dialog treats it as required:
        // something that cannot be dismissed reads as a trap.
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          // The backdrop. A press anywhere outside closes, which is what
          // every platform menu does and what people will try first.
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
              key={at}
              accessibilityRole="menuitem"
              // Announced and skipped rather than removed, the same
              // choice both Web components make.
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
