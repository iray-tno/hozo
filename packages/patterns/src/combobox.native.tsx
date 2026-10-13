import { hozoClasses } from '@hozo/engine/project'
import { type ReactNode, useCallback, useState } from 'react'
import { type StyleProp, Text, TextInput, View, type ViewStyle } from 'react-native'
import { filterOptions } from './combobox-rules.ts'
import { type InteractionState, Pressable } from './pressable.native.tsx'
import { splitTextStyle } from './text-style.native.ts'

export interface HozoComboboxOption<T> {
  value: T
  label: string
  render?: ReactNode
  disabled?: boolean
}

export interface HozoComboboxProps<T> {
  /**
   * Tailwind classes, the same prop the Web half takes.
   *
   * On a tag the compiler lowers it is gone by runtime, replaced by a
   * `StyleSheet` entry. Here it arrives as a string and is resolved through
   * the project's candidate map (#886), with the state of the element it
   * styles. Each `*Style` prop comes after its class list.
   */
  className?: string
  /** Class lists for the parts, resolved like `className`. */
  inputClassName?: string
  listClassName?: string
  optionClassName?: string
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
  className,
  inputClassName,
  listClassName,
  optionClassName,
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
    <View style={[hozoClasses(className), style]}>
      <TextInput
        style={hozoClasses(inputClassName, { 'aria-expanded': open })}
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
        <View
          accessibilityRole="list"
          accessibilityLabel={accessibilityLabel}
          style={[hozoClasses(listClassName), listStyle]}
        >
          {visible.length === 0
            ? emptyMessage
            : visible.map((index) => {
                const option = options[index]
                if (!option) return null
                const look = (interaction: InteractionState) =>
                  splitTextStyle(
                    hozoClasses(optionClassName, {
                      ...interaction,
                      disabled: Boolean(option.disabled),
                      'aria-selected': option.value === value,
                      'aria-disabled': Boolean(option.disabled),
                    }),
                  )
                const content = option.render ?? option.label
                return (
                  <Pressable
                    key={`option-${index}`}
                    accessibilityRole="menuitem"
                    accessibilityState={{
                      selected: option.value === value,
                      disabled: option.disabled,
                    }}
                    disabled={option.disabled}
                    style={(interaction) => [look(interaction)[0], optionStyle]}
                    onPress={() => commit(index)}
                  >
                    {(interaction) =>
                      typeof content === 'string' ? (
                        <Text style={look(interaction)[1]}>{content}</Text>
                      ) : (
                        content
                      )
                    }
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
