import { type ReactNode, useCallback, useState } from 'react'
import { Pressable, type StyleProp, View, type ViewStyle } from 'react-native'
import { optionKey } from './option-key.ts'

export interface HozoRadioOption<T> {
  /**
   * An identity of the caller's own, when the value has none.
   *
   * Options are keyed by their value, which is how they are selected.
   * That works for a string or a number and not for an object, and not
   * for two options that genuinely share a value -- this is the way out
   * of both.
   */
  id?: string
  value: T
  label: ReactNode
  disabled?: boolean
}

export interface HozoRadioGroupProps<T> {
  options: readonly HozoRadioOption<T>[]
  defaultValue?: T
  value?: T
  onValueChange?: (value: T) => void
  accessibilityLabel?: string
  style?: StyleProp<ViewStyle>
  optionStyle?: StyleProp<ViewStyle>
}

export function HozoRadioGroup<T>({
  options,
  defaultValue,
  value,
  onValueChange,
  accessibilityLabel,
  style,
  optionStyle,
}: HozoRadioGroupProps<T>) {
  const [uncontrolled, setUncontrolled] = useState<T | undefined>(defaultValue)
  const current = value ?? uncontrolled

  const select = useCallback(
    (at: number) => {
      const option = options[at]
      if (!option || option.disabled) return
      if (value === undefined) setUncontrolled(option.value)
      onValueChange?.(option.value)
    },
    [onValueChange, options, value],
  )

  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel} style={style}>
      {options.map((option, at) => (
        <Pressable
          key={optionKey(option.value, option.id, at)}
          accessibilityRole="radio"
          accessibilityState={{ checked: option.value === current, disabled: option.disabled }}
          style={optionStyle}
          onPress={() => select(at)}
        >
          {option.label}
        </Pressable>
      ))}
    </View>
  )
}

export {
  HozoRadioGroup as RadioGroup,
  type HozoRadioGroupProps as RadioGroupProps,
  type HozoRadioOption as RadioOption,
}
