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
          key={`option-${at}`}
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

export {
  HozoListbox as Listbox,
  type HozoListboxOption as ListboxOption,
  type HozoListboxProps as ListboxProps,
}
