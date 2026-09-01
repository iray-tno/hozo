// The React Native half of the combobox.
//
// The filtering is `./combobox.ts` unchanged, and the rest is a different
// control wearing the same name, which is worth saying plainly rather than
// papering over.
//
// `aria-activedescendant` does not exist here, and neither does the
// problem it solves: there is no keyboard focus to keep in the field,
// because a screen reader moves by swiping. So the list is a list, each
// row is pressable, and choosing one fills the field. Inline completion is
// left out for the same kind of reason -- text selection in a React Native
// `TextInput` is a controlled `selection` prop with per-platform
// behaviour, and a completion that half-works is worse than none, since
// the field it half-works in is the one the user is typing into.
//
// What does carry across is the announcement: the field says it is a
// combobox and whether the list is open, so a screen reader user is told
// there is something to open before they find it.

import { type ReactNode, useCallback, useState } from 'react'
import { Pressable, type StyleProp, TextInput, View, type ViewStyle } from 'react-native'

import { filterOptions } from './combobox.ts'

export interface HozoComboboxOption<T> {
  value: T
  label: string
  render?: ReactNode
  disabled?: boolean
}

export interface HozoComboboxProps<T> {
  options: readonly HozoComboboxOption<T>[]
  value?: T
  onValueChange?: (value: T) => void
  match?: 'starts' | 'contains'
  accessibilityLabel?: string
  placeholder?: string
  style?: StyleProp<ViewStyle>
  listStyle?: StyleProp<ViewStyle>
  optionStyle?: StyleProp<ViewStyle>
  emptyMessage?: ReactNode
}

export function HozoCombobox<T>({
  options,
  value,
  onValueChange,
  match = 'starts',
  accessibilityLabel,
  placeholder,
  style,
  listStyle,
  optionStyle,
  emptyMessage,
}: HozoComboboxProps<T>) {
  const chosen = options.find((option) => option.value === value)
  const [query, setQuery] = useState(chosen?.label ?? '')
  const [open, setOpen] = useState(false)

  const visible = filterOptions({ query, labels: options.map((option) => option.label), match })

  const commit = useCallback(
    (index: number) => {
      const option = options[index]
      if (!option || option.disabled) return
      setQuery(option.label)
      onValueChange?.(option.value)
      setOpen(false)
    },
    [onValueChange, options],
  )

  return (
    <View style={style}>
      <TextInput
        accessibilityRole="combobox"
        accessibilityLabel={accessibilityLabel}
        // The one piece of the Web version's semantics that survives, and
        // the one that matters most on this platform: it says there is a
        // list before anyone goes looking for one.
        accessibilityState={{ expanded: open }}
        placeholder={placeholder}
        value={query}
        onChangeText={(text) => {
          setQuery(text)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
      />
      {open ? (
        <View accessibilityRole="list" accessibilityLabel={accessibilityLabel} style={listStyle}>
          {visible.length === 0
            ? emptyMessage
            : visible.map((index) => {
                const option = options[index]
                if (!option) return null
                return (
                  <Pressable
                    key={index}
                    accessibilityRole="menuitem"
                    accessibilityState={{
                      selected: option.value === value,
                      disabled: option.disabled,
                    }}
                    style={optionStyle}
                    onPress={() => commit(index)}
                  >
                    {option.render ?? option.label}
                  </Pressable>
                )
              })}
        </View>
      ) : null}
    </View>
  )
}
