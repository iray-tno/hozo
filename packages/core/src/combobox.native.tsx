import { type ReactNode, useCallback, useState } from 'react'
import { Pressable, type StyleProp, TextInput, View, type ViewStyle } from 'react-native'

import { filterOptions } from './combobox-rules.ts'

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
        accessibilityState={{ expanded: open }}
        placeholder={placeholder}
        value={query}
        onChangeText={(text: string) => {
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
                    key={`option-${index}`}
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

export {
  HozoCombobox as Combobox,
  type HozoComboboxOption as ComboboxOption,
  type HozoComboboxProps as ComboboxProps,
}
