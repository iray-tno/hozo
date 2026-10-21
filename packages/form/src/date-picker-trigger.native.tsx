import { usePressableInteraction } from '@hozo/behaviors/pressable-interaction'
import { hozoSplitTextStyle } from '@hozo/engine'
import { hozoClasses } from '@hozo/engine/project'
import { useEffect } from 'react'
import {
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  type TextStyle,
  type ViewStyle,
} from 'react-native'
import { nonControlClassFacts } from './class-facts.native.ts'

/** The three date pickers have the same real Web button owner, not three
 * subtly different interpretations of expanded/disabled and text styles.
 * This leaf also keeps pointer/focus updates out of their Calendar render. */
export function DatePickerTrigger({
  children,
  className,
  style,
  textStyle,
  expanded,
  disabled = false,
  accessibilityLabel,
  accessibilityValue,
  onPress,
}: {
  children: string
  className?: string
  style?: StyleProp<ViewStyle>
  textStyle?: StyleProp<TextStyle>
  expanded: boolean
  disabled?: boolean
  accessibilityLabel?: string
  accessibilityValue?: { text: string }
  onPress: () => void
}) {
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
        ...nonControlClassFacts,
        ...state,
        disabled,
        enabled: !disabled,
        pressed: !disabled && state.pressed,
        focused: !disabled && state.focused,
        focusVisible: !disabled && state.focusVisible,
        'aria-expanded': expanded,
      }),
      style,
    ]) ?? {},
  )
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={accessibilityValue}
      accessibilityState={{ expanded, disabled }}
      disabled={disabled}
      style={box as ViewStyle}
      onPress={() => {
        if (!disabled) onPress()
      }}
      onHoverIn={handlers.hoverIn}
      onHoverOut={handlers.hoverOut}
      onFocus={() => {
        if (!disabled) handlers.focus()
      }}
      onBlur={handlers.blur}
      onPressIn={() => {
        if (!disabled) handlers.pressIn()
      }}
      onPressOut={handlers.pressOut}
      onPointerDown={handlers.pointerDown}
      onKeyDown={handlers.keyDown}
    >
      <Text style={[text as TextStyle, textStyle]}>{children}</Text>
    </Pressable>
  )
}
