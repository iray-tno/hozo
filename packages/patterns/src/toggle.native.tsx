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

import { hozoAuthoredStyle } from '@hozo/engine/generated/gap-styles'
import { hozoClasses } from '@hozo/engine/project'
import { type ReactNode, useCallback, useState } from 'react'
import { type StyleProp, Text, type TextStyle, type ViewStyle } from 'react-native'
import { controlIndicator } from './control-indicator.native.tsx'
import type { HozoControlIndicatorClasses } from './control-indicator-classes.ts'
import { type InteractionState, Pressable } from './pressable.native.tsx'
import { splitTextStyle } from './text-style.native.ts'

/** Checked, not checked, or -- for a checkbox only -- partly. */
export type HozoCheckedState = boolean | 'mixed'

interface Shared<T extends HozoCheckedState> {
  /** Decorative slots painted from the pattern's actual state; no CSS is imposed. */
  indicator?: (state: { checked: T; disabled: boolean }) => HozoControlIndicatorClasses
  /**
   * Tailwind classes, the same prop the Web half takes.
   *
   * On a tag the compiler lowers it is gone by runtime, replaced by a
   * `StyleSheet` entry. Here it arrives as a string and is resolved through
   * the project's candidate map (#886), with the control's interaction,
   * `aria-checked` and `disabled` state. A string child takes the text half.
   * `style` comes after it.
   */
  className?: string
  children?: ReactNode
  accessibilityLabel?: string
  disabled?: boolean
  style?: StyleProp<ViewStyle>
}

export interface HozoCheckboxStyleState {
  readonly pressed: boolean
  readonly hovered: boolean
  readonly focused: boolean
  readonly focusVisible: boolean
  readonly disabled: boolean
  readonly 'aria-checked': boolean
  readonly 'data-hozo-disabled': boolean
  readonly 'data-hozo-state=checked': boolean
  readonly 'data-hozo-state=unchecked': boolean
  readonly 'data-hozo-state=mixed': boolean
}

export interface HozoSwitchStyleState {
  readonly pressed: boolean
  readonly hovered: boolean
  readonly focused: boolean
  readonly focusVisible: boolean
  readonly disabled: boolean
  readonly 'aria-checked': boolean
  readonly 'data-hozo-disabled': boolean
  readonly 'data-hozo-state=checked': boolean
  readonly 'data-hozo-state=unchecked': boolean
}

export interface HozoCheckboxProps extends Shared<HozoCheckedState> {
  checked?: HozoCheckedState
  defaultChecked?: HozoCheckedState
  /** Called with what the control became, which is never `mixed`. */
  onCheckedChange?: (checked: boolean) => void
  /** @internal Prepared root class contribution compiled by the owner contract. */
  hozoCheckboxStyle?: (state: HozoCheckboxStyleState) => StyleProp<ViewStyle | TextStyle>
}

export interface HozoSwitchProps extends Shared<boolean> {
  checked?: boolean
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
  /** @internal Prepared root class contribution compiled by the owner contract. */
  hozoSwitchStyle?: (state: HozoSwitchStyleState) => StyleProp<ViewStyle | TextStyle>
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

const EMPTY_LOOK: [ViewStyle, TextStyle] = [{}, {}]

/** A control's resolved classes, split into its box and its label (#886). */
function lookCheckbox(
  className: string | undefined,
  prepared: ((state: HozoCheckboxStyleState) => StyleProp<ViewStyle | TextStyle>) | undefined,
  interaction: InteractionState,
  state: HozoCheckedState,
  disabled?: boolean,
): [ViewStyle, TextStyle] {
  if (!prepared && !className) return EMPTY_LOOK
  const facts: HozoCheckboxStyleState = {
    ...interaction,
    disabled: Boolean(disabled),
    'aria-checked': state === true,
    'data-hozo-disabled': Boolean(disabled),
    'data-hozo-state=checked': state === true,
    'data-hozo-state=unchecked': state === false,
    'data-hozo-state=mixed': state === 'mixed',
  }
  return splitTextStyle(
    prepared
      ? prepared(facts)
      : hozoClasses(className, { ...facts, 'aria-disabled': Boolean(disabled) }),
  )
}

function lookSwitch(
  className: string | undefined,
  prepared: ((state: HozoSwitchStyleState) => StyleProp<ViewStyle | TextStyle>) | undefined,
  interaction: InteractionState,
  checked: boolean,
  disabled?: boolean,
): [ViewStyle, TextStyle] {
  if (!prepared && !className) return EMPTY_LOOK
  const facts: HozoSwitchStyleState = {
    ...interaction,
    disabled: Boolean(disabled),
    'aria-checked': checked,
    'data-hozo-disabled': Boolean(disabled),
    'data-hozo-state=checked': checked,
    'data-hozo-state=unchecked': !checked,
  }
  return splitTextStyle(
    prepared
      ? prepared(facts)
      : hozoClasses(className, { ...facts, 'aria-disabled': Boolean(disabled) }),
  )
}

/** A string child in a `Text` with the label's styles; anything else as it is. */
function label(children: ReactNode, text: TextStyle) {
  return typeof children === 'string' ? <Text style={text}>{children}</Text> : children
}

export function HozoCheckbox({
  checked,
  defaultChecked,
  onCheckedChange,
  className,
  children,
  accessibilityLabel,
  disabled,
  style,
  indicator,
  hozoCheckboxStyle,
}: HozoCheckboxProps) {
  if (hozoCheckboxStyle && className !== undefined)
    throw new Error('Prepared Checkbox styles must consume className')
  const { state, press } = useToggle(checked, defaultChecked, onCheckedChange)
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: state, disabled }}
      disabled={disabled}
      style={(interaction) => [
        lookCheckbox(className, hozoCheckboxStyle, interaction, state, disabled)[0],
        hozoAuthoredStyle(style),
      ]}
      onPress={press}
    >
      {(interaction) => {
        const text = label(
          children,
          lookCheckbox(className, hozoCheckboxStyle, interaction, state, disabled)[1],
        )
        if (!indicator) return text
        return (
          <>
            {controlIndicator(indicator({ checked: state, disabled: Boolean(disabled) }), {
              ...interaction,
              disabled: Boolean(disabled),
              'aria-checked': state === true,
              'aria-disabled': Boolean(disabled),
            })}
            {text}
          </>
        )
      }}
    </Pressable>
  )
}

export function HozoSwitch({
  checked,
  defaultChecked,
  onCheckedChange,
  className,
  children,
  accessibilityLabel,
  disabled,
  style,
  indicator,
  hozoSwitchStyle,
}: HozoSwitchProps) {
  if (hozoSwitchStyle && className !== undefined)
    throw new Error('Prepared Switch styles must consume className')
  const { state, press } = useToggle(checked, defaultChecked, onCheckedChange)
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: state === true, disabled }}
      disabled={disabled}
      style={(interaction) => [
        lookSwitch(className, hozoSwitchStyle, interaction, state === true, disabled)[0],
        hozoAuthoredStyle(style),
      ]}
      onPress={press}
    >
      {(interaction) => {
        const text = label(
          children,
          lookSwitch(className, hozoSwitchStyle, interaction, state === true, disabled)[1],
        )
        if (!indicator) return text
        return (
          <>
            {controlIndicator(indicator({ checked: state === true, disabled: Boolean(disabled) }), {
              ...interaction,
              disabled: Boolean(disabled),
              'aria-checked': state === true,
              'aria-disabled': Boolean(disabled),
            })}
            {text}
          </>
        )
      }}
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
