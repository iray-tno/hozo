// The React Native half of the radio group.
//
// The same asymmetry as the tab strip and the menu: no arrow keys, no tab
// order, so `./roving.ts` has nothing to decide and this is the semantics.
// React Native has `radiogroup` and `radio` in its own role list, and
// `checked` in `accessibilityState` is what VoiceOver and TalkBack
// announce -- the platform's spelling of `aria-checked`.
//
// One thing that does carry over unchanged, because it is about the
// control rather than the keyboard: an unchosen group is still a group,
// and every option is still announced as one of a set. That is what the
// `radiogroup` wrapper buys, and it is the part a row of `Pressable`s with
// a tick next to one of them does not have.

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
          key={at}
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
