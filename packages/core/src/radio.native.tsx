import { type ReactNode, useCallback, useState } from 'react'
import { Pressable, type StyleProp, View, type ViewStyle } from 'react-native'

export interface HozoRadioOption<T> {
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
          key={`radio-${at}`}
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
