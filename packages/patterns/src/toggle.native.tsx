/**
 * Checkbox and Switch on React Native. See `toggle.tsx` for why they share a
 * file and how the two roles differ.
 *
 * `accessibilityRole="switch"` is a real role here rather than a courtesy:
 * React Native maps it to `UISwitch` traits on iOS and to a
 * `Switch`-classed node on Android, so TalkBack and VoiceOver say "on"/"off"
 * for it and "checked"/"not checked" for the checkbox, the same distinction
 * the Web half makes with ARIA.
 *
 * `accessibilityState.checked` takes `'mixed'`, which is the one place this
 * platform has the third state the Web half needs, so the checkbox keeps it
 * and the switch does not.
 *
 * Not React Native's own `<Switch>`. That component is a rendered control with
 * a platform look and a `value` prop, and this package's half of a pattern is
 * the semantics and the behaviour with the drawing left to the application --
 * the same reason `RadioGroup` here is a `Pressable` and not a picker.
 */

import { type ReactNode, useCallback, useState } from 'react'
import { Pressable, type StyleProp, type ViewStyle } from 'react-native'

/** Checked, not checked, or -- for a checkbox only -- partly. */
export type HozoCheckedState = boolean | 'mixed'

interface Shared {
  /**
   * Tailwind classes, the same prop the Web half takes.
   *
   * On a tag the compiler lowers it is gone by runtime, replaced by a
   * `StyleSheet` entry. Anywhere else it is carried and ignored here --
   * this side has no CSS engine to resolve a class list against -- and
   * the type still has to accept it, because an app is type-checked
   * against the source the compiler reads rather than its output.
   */
  className?: string
  children?: ReactNode
  accessibilityLabel?: string
  disabled?: boolean
  style?: StyleProp<ViewStyle>
}

export interface HozoCheckboxProps extends Shared {
  checked?: HozoCheckedState
  defaultChecked?: HozoCheckedState
  /** Called with what the control became, which is never `mixed`. */
  onCheckedChange?: (checked: boolean) => void
}

export interface HozoSwitchProps extends Shared {
  checked?: boolean
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
}

/** What a press produces. Mixed resolves to checked, as the APG specifies. */
const toggled = (state: HozoCheckedState): boolean => state !== true

function useToggle(
  controlled: HozoCheckedState | undefined,
  initial: HozoCheckedState | undefined,
  notify: ((checked: boolean) => void) | undefined,
) {
  const [uncontrolled, setUncontrolled] = useState<HozoCheckedState>(initial ?? false)
  const state = controlled ?? uncontrolled
  const press = useCallback(() => {
    const next = toggled(state)
    if (controlled === undefined) setUncontrolled(next)
    notify?.(next)
  }, [controlled, notify, state])
  return { state, press }
}

export function HozoCheckbox({
  checked,
  defaultChecked,
  onCheckedChange,
  children,
  accessibilityLabel,
  disabled,
  style,
}: HozoCheckboxProps) {
  const { state, press } = useToggle(checked, defaultChecked, onCheckedChange)
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: state, disabled }}
      disabled={disabled}
      style={style}
      onPress={press}
    >
      {children}
    </Pressable>
  )
}

export function HozoSwitch({
  checked,
  defaultChecked,
  onCheckedChange,
  children,
  accessibilityLabel,
  disabled,
  style,
}: HozoSwitchProps) {
  const { state, press } = useToggle(checked, defaultChecked, onCheckedChange)
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: state === true, disabled }}
      disabled={disabled}
      style={style}
      onPress={press}
    >
      {children}
    </Pressable>
  )
}

export {
  HozoCheckbox as Checkbox,
  type HozoCheckboxProps as CheckboxProps,
  type HozoCheckedState as CheckedState,
  HozoSwitch as Switch,
  type HozoSwitchProps as SwitchProps,
}
