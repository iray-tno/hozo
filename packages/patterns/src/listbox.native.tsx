import { hozoClasses } from '@hozo/engine/project'
import { type ReactNode, useCallback, useState } from 'react'
import { type StyleProp, Text, View, type ViewStyle } from 'react-native'
import { optionKey } from './option-key.ts'
import { type InteractionState, Pressable } from './pressable.native.tsx'
import { splitTextStyle } from './text-style.native.ts'

export interface HozoListboxOption<T> {
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
  label: string
  render?: ReactNode
  disabled?: boolean
}

interface Shared<T> {
  /**
   * Tailwind classes, the same prop the Web half takes.
   *
   * On a tag the compiler lowers it is gone by runtime, replaced by a
   * `StyleSheet` entry. Here it arrives as a string and is resolved through
   * the project's candidate map (#886), an option with its interaction,
   * `aria-selected` and `disabled` state. A string label takes the text half
   * of its option's styles. Each `*Style` prop comes after its class list.
   */
  className?: string
  /** The class list for each option, resolved like `className`. */
  optionClassName?: string
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
  const { className, optionClassName, options, accessibilityLabel, style, optionStyle } = props
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
      style={[hozoClasses(className), style]}
    >
      {options.map((option, at) => {
        const selected = chosen.includes(option.value)
        const look = (interaction: InteractionState) =>
          splitTextStyle(
            hozoClasses(optionClassName, {
              ...interaction,
              disabled: Boolean(option.disabled),
              'aria-selected': selected,
              'aria-disabled': Boolean(option.disabled),
            }),
          )
        const content = option.render ?? option.label
        return (
          <Pressable
            key={optionKey(option.value, option.id, at)}
            accessibilityRole="menuitem"
            accessibilityState={{ selected, disabled: option.disabled }}
            disabled={option.disabled}
            style={(interaction) => [look(interaction)[0], optionStyle]}
            onPress={() => toggle(at)}
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
  )
}

export {
  HozoListbox as Listbox,
  type HozoListboxOption as ListboxOption,
  type HozoListboxProps as ListboxProps,
}
