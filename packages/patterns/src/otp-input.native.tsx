import { useHozoMessage } from '@hozo/behaviors'
import { type ComponentRef, useRef, useState } from 'react'
import {
  Pressable,
  type StyleProp,
  Text,
  TextInput,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native'
import { type OtpType, otpActiveIndex, otpValue } from './otp-rules.ts'
import { splitTextStyle } from './text-style.native.ts'

export type { OtpType }

type Style = StyleProp<ViewStyle | TextStyle>

export interface HozoOtpInputProps {
  length?: number
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  onComplete?: (value: string) => void
  type?: OtpType
  mask?: boolean
  autoFocus?: boolean
  disabled?: boolean
  accessibilityLabel: string
  /**
   * Tailwind classes, the same props the Web half takes. Read by the
   * compiler, which hands them over as the style props below; a file it did
   * not read leaves them here, where a Native pattern has no class list to
   * resolve.
   */
  className?: string
  cellClassName?: string
  activeCellClassName?: string
  filledCellClassName?: string
  /** Web only: the ring on the focused input. Carried and unused here. */
  inputClassName?: string
  style?: Style
  cellStyle?: Style
  activeCellStyle?: Style
  filledCellStyle?: Style
  testID?: string
}

/**
 * A one-time code or a PIN on React Native: one `TextInput`, drawn as cells,
 * for the reasons the Web half gives. The input asks for what each platform
 * calls a one-time code -- `textContentType="oneTimeCode"` on iOS,
 * `autoComplete="sms-otp"` on Android -- so the code from a text message is
 * offered above the keyboard and fills the field at once.
 *
 * The input is laid over the cells and nearly transparent, so a press on any
 * cell focuses it and a screen reader finds one field: its label, "6
 * characters", and what has been typed. The cells are hidden from it.
 */
export function HozoOtpInput({
  length = 6,
  value,
  defaultValue,
  onChange,
  onComplete,
  type = 'number',
  mask = false,
  autoFocus,
  disabled,
  accessibilityLabel,
  style,
  cellStyle,
  activeCellStyle,
  filledCellStyle,
  testID,
}: HozoOtpInputProps) {
  const message = useHozoMessage()
  const input = useRef<ComponentRef<typeof TextInput>>(null)
  const [uncontrolled, setUncontrolled] = useState(() => otpValue(defaultValue ?? '', length, type))
  const [focused, setFocused] = useState(false)
  const code = value !== undefined ? otpValue(value, length, type) : uncontrolled
  const characters = Array.from(code)
  const active = otpActiveIndex(code, length)
  const [box, text] = splitTextStyle(style)

  const change = (raw: string) => {
    const next = otpValue(raw, length, type)
    if (value === undefined) setUncontrolled(next)
    onChange?.(next)
    if (Array.from(next).length === length && next !== code) onComplete?.(next)
  }

  return (
    <Pressable
      onPress={() => input.current?.focus()}
      disabled={disabled}
      accessible={false}
      style={[ROW, box]}
      testID={testID}
    >
      {Array.from({ length }, (_, position) => position).map((index) => {
        const character = characters[index]
        const [cellBox, cellText] = splitTextStyle([
          cellStyle,
          focused && index === active && activeCellStyle,
          character !== undefined && filledCellStyle,
        ])
        return (
          <View
            key={index}
            style={[CENTRED, cellBox]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Text style={[text, cellText]}>
              {character === undefined ? '' : mask ? '•' : character}
            </Text>
          </View>
        )
      })}
      <TextInput
        ref={input}
        value={code}
        onChangeText={change}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType={type === 'number' ? 'number-pad' : 'default'}
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        autoCorrect={false}
        autoCapitalize="none"
        secureTextEntry={mask}
        maxLength={length * 2}
        autoFocus={autoFocus}
        editable={!disabled}
        caretHidden
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={message('hozo.otpInput.hint', { length })}
        style={INPUT}
      />
    </Pressable>
  )
}

const ROW: ViewStyle = { flexDirection: 'row', alignSelf: 'flex-start' }
const CENTRED: ViewStyle = { alignItems: 'center', justifyContent: 'center' }
/**
 * Over the cells. Not opacity 0, which Android can treat as not there for
 * focus and autofill; nearly transparent is enough to draw nothing.
 */
const INPUT: TextStyle = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  opacity: 0.011,
  color: 'transparent',
}

export { HozoOtpInput as OtpInput, type HozoOtpInputProps as OtpInputProps }
