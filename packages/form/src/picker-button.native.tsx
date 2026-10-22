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

/** The date/time picker buttons share the same real Web button owner,
 * not subtly different interpretations of interaction and text styles.
 * Only triggers supply expanded: Done has no expansion state to announce.
 * This leaf also keeps pointer/focus updates out of their Calendar render. */
export function PickerButton({
  children,
  className,
  style,
  textStyle,
  inheritedTextStyle,
  dataFacts,
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
  inheritedTextStyle?: StyleProp<TextStyle>
  /** Normalized data presence/equality predicates supplied only by the actual owner. */
  dataFacts?: Readonly<Record<`data-${string}`, boolean>>
  expanded?: boolean
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
        ...dataFacts,
        ...state,
        disabled,
        enabled: !disabled,
        pressed: !disabled && state.pressed,
        focused: !disabled && state.focused,
        focusVisible: !disabled && state.focusVisible,
        'aria-expanded': expanded ?? false,
      }),
      style,
    ]) ?? {},
  )
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={accessibilityValue}
      accessibilityState={expanded === undefined ? { disabled } : { expanded, disabled }}
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
      <Text style={[inheritedTextStyle, text as TextStyle, textStyle]}>{children}</Text>
    </Pressable>
  )
}
