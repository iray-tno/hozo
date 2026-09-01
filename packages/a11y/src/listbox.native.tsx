// The React Native half of the listbox.
//
// The selection model survives the crossing and the keyboard does not,
// which is the same split the other patterns make -- but here the half
// that survives is the interesting one. Single versus multiple is not a
// keyboard fact: it is what the control *is*, and a screen reader has to
// be told before someone finds out by pressing something.
//
// React Native has no `aria-multiselectable`. What it has is
// `accessibilityState.selected` per option, which announces each one, and
// nothing that announces the set. So the group carries an
// `accessibilityHint` saying how many may be chosen -- a worse answer than
// the Web's and the only one available, stated here rather than left as a
// silent difference.

import { type ReactNode, useCallback, useState } from 'react'
import { Pressable, type StyleProp, View, type ViewStyle } from 'react-native'

export interface HozoListboxOption<T> {
  value: T
  label: string
  render?: ReactNode
  disabled?: boolean
}

interface Shared<T> {
  options: readonly HozoListboxOption<T>[]
  accessibilityLabel?: string
  style?: StyleProp<ViewStyle>
  optionStyle?: StyleProp<ViewStyle>
}

export interface HozoListboxSingleProps<T> extends Shared<T> {
  multiple?: false
  defaultValue?: T
  value?: T
  onValueChange?: (value: T) => void
}

export interface HozoListboxMultipleProps<T> extends Shared<T> {
  multiple: true
  defaultValue?: readonly T[]
  value?: readonly T[]
  onValueChange?: (value: T[]) => void
}

export type HozoListboxProps<T> = HozoListboxSingleProps<T> | HozoListboxMultipleProps<T>

export function HozoListbox<T>(props: HozoListboxProps<T>) {
  const { options, accessibilityLabel, style, optionStyle } = props
  const multiple = props.multiple === true

  const [uncontrolled, setUncontrolled] = useState<T[]>(() =>
    props.defaultValue === undefined
      ? []
      : Array.isArray(props.defaultValue)
        ? [...(props.defaultValue as readonly T[])]
        : [props.defaultValue as T],
  )
  const chosen: readonly T[] =
    props.value === undefined
      ? uncontrolled
      : Array.isArray(props.value)
        ? (props.value as readonly T[])
        : [props.value as T]

  const commit = useCallback(
    (next: T[]) => {
      if (props.value === undefined) setUncontrolled(next)
      if (props.multiple === true) props.onValueChange?.(next)
      else if (next[0] !== undefined) props.onValueChange?.(next[0])
    },
    [props],
  )

  const toggle = (at: number) => {
    const option = options[at]
    if (!option || option.disabled) return
    if (!multiple) {
      commit([option.value])
      return
    }
    const already = chosen.includes(option.value)
    commit(already ? chosen.filter((value) => value !== option.value) : [...chosen, option.value])
  }

  return (
    <View
      accessibilityRole="list"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={multiple ? 'Choose one or more' : undefined}
      style={style}
    >
      {options.map((option, at) => (
        <Pressable
          key={at}
          // `menuitem` is the nearest React Native role that announces as a
          // choosable thing in a set. There is no `option`, and claiming
          // `radio` would say "one of these" for a multi-select.
          accessibilityRole="menuitem"
          accessibilityState={{
            selected: chosen.includes(option.value),
            disabled: option.disabled,
          }}
          style={optionStyle}
          onPress={() => toggle(at)}
        >
          {option.render ?? option.label}
        </Pressable>
      ))}
    </View>
  )
}
