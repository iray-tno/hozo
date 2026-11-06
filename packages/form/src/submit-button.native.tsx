import { hozoTextChildren } from '@hozo/behaviors'
import { usePressableInteraction } from '@hozo/behaviors/pressable-interaction'
import { hozoSplitTextStyle } from '@hozo/engine'
import { hozoAuthoredStyle } from '@hozo/engine/generated/gap-styles'
import { hozoClasses } from '@hozo/engine/project'
import { type ComponentRef, type ReactNode, type Ref, useEffect } from 'react'
import {
  Pressable,
  type PressableProps,
  type StyleProp,
  StyleSheet,
  type TextStyle,
  type ViewStyle,
} from 'react-native'
import { useFormSubmit } from './form.native.tsx'
import { type FormButtonClassFacts, formButtonClassConstants } from './owner-facts.native.ts'

export interface HozoSubmitButtonProps {
  children?: ReactNode
  /**
   * Tailwind classes, the same prop the Web half takes, resolved against the
   * project's candidate map with this button's own interaction state.
   */
  className?: string
  style?: StyleProp<ViewStyle>
  disabled?: boolean
  accessibilityLabel?: string
  accessibilityHint?: string
  testID?: string
  nativeID?: string
  /** What `Tooltip` writes to make this its trigger. */
  ref?: Ref<ComponentRef<typeof Pressable>>
  onHoverIn?: PressableProps['onHoverIn']
  onHoverOut?: PressableProps['onHoverOut']
  onLongPress?: PressableProps['onLongPress']
  onFocus?: PressableProps['onFocus']
  onBlur?: PressableProps['onBlur']
}

/**
 * The button that submits the enclosing `Form`, on a platform with no form
 * element. Pressing it is `useFormSubmit()`, which closes the keyboard and calls
 * the `Form`'s `onSubmit`. See the Web half for why this is a component.
 */
export function HozoSubmitButton({
  children,
  className,
  style,
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
  testID,
  nativeID,
  ref,
  onHoverIn,
  onHoverOut,
  onLongPress,
  onFocus,
  onBlur,
}: HozoSubmitButtonProps) {
  const submit = useFormSubmit()
  const { state, handlers } = usePressableInteraction({ focusVisible: true })
  useEffect(() => {
    if (disabled) {
      handlers.blur()
      handlers.pressOut()
    }
  }, [disabled, handlers])
  const [box, text] = hozoSplitTextStyle(
    StyleSheet.flatten([
      hozoClasses(className, {
        ...formButtonClassConstants,
        ...state,
        disabled,
        enabled: !disabled,
        pressed: !disabled && state.pressed,
        focused: !disabled && state.focused,
        focusVisible: !disabled && state.focusVisible,
      } satisfies FormButtonClassFacts),
      hozoAuthoredStyle(style),
    ]) ?? {},
  )
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      testID={testID}
      nativeID={nativeID}
      style={box as ViewStyle}
      onPress={() => {
        if (!disabled) submit()
      }}
      onLongPress={onLongPress}
      onHoverIn={(event) => {
        handlers.hoverIn()
        onHoverIn?.(event)
      }}
      onHoverOut={(event) => {
        handlers.hoverOut()
        onHoverOut?.(event)
      }}
      onFocus={(event) => {
        if (!disabled) handlers.focus()
        onFocus?.(event)
      }}
      onBlur={(event) => {
        handlers.blur()
        onBlur?.(event)
      }}
      onPressIn={() => {
        if (!disabled) handlers.pressIn()
      }}
      onPressOut={handlers.pressOut}
      onPointerDown={handlers.pointerDown}
      onKeyDown={handlers.keyDown}
    >
      {hozoTextChildren(children, text as TextStyle)}
    </Pressable>
  )
}

export { HozoSubmitButton as SubmitButton, type HozoSubmitButtonProps as SubmitButtonProps }
