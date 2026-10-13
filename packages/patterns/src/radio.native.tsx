import { hozoClasses } from '@hozo/engine/project'
import { type ReactNode, useCallback, useState } from 'react'
import { Pressable, type StyleProp, Text, View, type ViewStyle } from 'react-native'
import { controlIndicator } from './control-indicator.native.tsx'
import type { HozoControlIndicatorClasses } from './control-indicator-classes.ts'
import { optionKey } from './option-key.ts'
import { splitTextStyle } from './text-style.native.ts'

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
  /** Decorative option slots, derived from the very state that accessibilityState announces. */
  indicator?: (state: { checked: boolean; disabled: boolean }) => HozoControlIndicatorClasses
  /**
   * Tailwind classes, the same prop the Web half takes.
   *
   * On a tag the compiler lowers it is gone by runtime, replaced by a
   * `StyleSheet` entry. Here it arrives as a string and is resolved through
   * the project's candidate map (#886), an option with its `pressed`,
   * `aria-checked` and `disabled` state. A string label takes the text half
   * of its option's styles. Each `*Style` prop comes after its class list.
   */
  className?: string
  /** The class list for each option, resolved like `className`. */
  optionClassName?: string
  /** Shared author prop; Native focus order does not use the Web arrow-key axis. */
  orientation?: 'horizontal' | 'vertical' | 'both'
  options: readonly HozoRadioOption<T>[]
  defaultValue?: T
  value?: T
  onValueChange?: (value: T) => void
  accessibilityLabel?: string
  style?: StyleProp<ViewStyle>
  optionStyle?: StyleProp<ViewStyle>
}

export function HozoRadioGroup<T>({
  className,
  optionClassName,
  options,
  defaultValue,
  value,
  onValueChange,
  accessibilityLabel,
  style,
  optionStyle,
  indicator,
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
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={[hozoClasses(className), style]}
    >
      {options.map((option, at) => {
        const checked = option.value === current
        const look = (pressed: boolean) =>
          splitTextStyle(
            hozoClasses(optionClassName, {
              pressed,
              disabled: Boolean(option.disabled),
              'aria-checked': checked,
              'aria-disabled': Boolean(option.disabled),
            }),
          )
        return (
          <Pressable
            key={optionKey(option.value, option.id, at)}
            accessibilityRole="radio"
            accessibilityState={{ checked, disabled: option.disabled }}
            style={({ pressed }) => [look(pressed)[0], optionStyle]}
            onPress={() => select(at)}
          >
            {({ pressed }) => {
              const text =
                typeof option.label === 'string' ? (
                  <Text style={look(pressed)[1]}>{option.label}</Text>
                ) : (
                  option.label
                )
              if (!indicator) return text
              return (
                <>
                  {controlIndicator(indicator({ checked, disabled: Boolean(option.disabled) }), {
                    pressed,
                    disabled: Boolean(option.disabled),
                    'aria-checked': checked,
                    'aria-disabled': Boolean(option.disabled),
                  })}
                  {text}
                </>
              )
            }}
          </Pressable>
        )
      })}
    </View>
  )
}

export {
  HozoRadioGroup as RadioGroup,
  type HozoRadioGroupProps as RadioGroupProps,
  type HozoRadioOption as RadioOption,
}
