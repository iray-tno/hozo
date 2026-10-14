import { useHozoMessage } from '@hozo/behaviors'
import { usePressableInteraction } from '@hozo/behaviors/pressable-interaction'
import { hozoClasses } from '@hozo/engine/project'
import { type ComponentRef, useLayoutEffect, useRef, useState } from 'react'
import { type StyleProp, Text, TextInput, type TextStyle, View, type ViewStyle } from 'react-native'
import { type OtpSelection, type OtpType, otpActiveIndex, otpCaret, otpValue } from './otp-rules.ts'
import { type InteractionState, Pressable } from './pressable.native.tsx'
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
  readOnly?: boolean
  showCaret?: boolean
  accessibilityLabel: string
  /**
   * Tailwind classes, the same props the Web half takes. Read by the
   * compiler, which hands them over as the style props below; a file it did
   * not read leaves them here as strings, resolved through the project's
   * candidate map (#886) before the matching style prop -- a cell with the
   * input's focused/focus-visible state when it is the active one, and the
   * wrapper's hover/press facts. Input focus never comes from the wrapper.
   */
  className?: string
  cellClassName?: string
  activeCellClassName?: string
  filledCellClassName?: string
  /** The input's decoration, driven by input focus rather than a virtual cell. */
  inputClassName?: string
  style?: Style
  cellStyle?: Style
  activeCellStyle?: Style
  filledCellStyle?: Style
  inputStyle?: Style
  /** Compiler-only input focus callback; cells never consume input focus predicates. */
  hozoInputStyle?: (state: InteractionState) => Style
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
  readOnly,
  showCaret = true,
  accessibilityLabel,
  className,
  cellClassName,
  activeCellClassName,
  filledCellClassName,
  inputClassName,
  style,
  cellStyle,
  activeCellStyle,
  filledCellStyle,
  inputStyle,
  hozoInputStyle,
  testID,
}: HozoOtpInputProps) {
  const message = useHozoMessage()
  const input = useRef<ComponentRef<typeof TextInput>>(null)
  const [uncontrolled, setUncontrolled] = useState(() => otpValue(defaultValue ?? '', length, type))
  const { state: inputInteraction, handlers: inputHandlers } = usePressableInteraction({
    // A typing field keeps visible focus even when a touch opened its keyboard.
    // Wrapper buttons retain their own pointer policy; cells are not owners.
    focusVisible: 'keyboard-input',
  })
  const focused = inputInteraction.focused
  const [selection, setSelection] = useState<OtpSelection | null>(null)
  const code = value !== undefined ? otpValue(value, length, type) : uncontrolled
  // RN may deliver change and selection before React commits a render.
  // Record the actual buffer synchronously so a batched selection does not
  // get labelled with the previous value. Sanitized buffers stay untrusted.
  const selectionValue = useRef(code)
  useLayoutEffect(() => {
    selectionValue.current = code
  }, [code])
  const characters = Array.from(code)
  const caret = otpCaret(code, length, selection)
  const active = caret?.index ?? otpActiveIndex(code, length)
  const show = showCaret && focused && !disabled && !readOnly
  const hasInputStyle = Boolean(inputClassName || inputStyle || hozoInputStyle)
  const [inputBox, inputText] = splitTextStyle([
    hozoClasses(inputClassName, {
      focused: inputInteraction.focused,
      focusVisible: inputInteraction.focusVisible,
      disabled: Boolean(disabled),
    }),
    hozoInputStyle?.(inputInteraction),
    inputStyle,
  ])
  // The wrapper is an unfocusable hit target, not a second input. In
  // particular a bubbled input focus must not give it a focus-visible ring.
  const wrapperFacts = (interaction: InteractionState) => ({
    ...interaction,
    focused: false,
    focusVisible: false,
    disabled: Boolean(disabled),
  })
  const look = (interaction: InteractionState) =>
    splitTextStyle([hozoClasses(className, wrapperFacts(interaction)), style])

  const change = (raw: string) => {
    const next = otpValue(raw, length, type)
    if (value === undefined) setUncontrolled(next)
    selectionValue.current = raw
    setSelection(null)
    onChange?.(next)
    if (Array.from(next).length === length && next !== code) onComplete?.(next)
  }

  return (
    <Pressable
      onPress={() => input.current?.focus()}
      disabled={disabled}
      accessible={false}
      focusable={false}
      onPointerDown={inputHandlers.pointerDown}
      onPressIn={inputHandlers.pointerDown}
      onKeyDown={inputHandlers.keyDown}
      style={(interaction) => [ROW, look(interaction)[0]]}
      testID={testID}
    >
      {(interaction) => {
        const text = look(interaction)[1]
        return (
          <>
            {Array.from({ length }, (_, position) => position).map((index) => {
              const character = characters[index]
              const facts = {
                ...wrapperFacts(interaction),
                focused: focused && index === active,
                focusVisible: inputInteraction.focusVisible && index === active,
              }
              const [cellBox, cellText] = splitTextStyle([
                hozoClasses(cellClassName, facts),
                cellStyle,
                focused &&
                  index === active && [hozoClasses(activeCellClassName, facts), activeCellStyle],
                character !== undefined && [
                  hozoClasses(filledCellClassName, facts),
                  filledCellStyle,
                ],
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
                  {show && caret?.index === index ? (
                    <Text
                      testID="hozo-otp-caret"
                      pointerEvents="none"
                      accessible={false}
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants"
                      style={[
                        text,
                        cellText,
                        {
                          position: 'absolute',
                          transform: [
                            {
                              translateX:
                                character === undefined
                                  ? 0
                                  : (caret.after ? 0.5 : -0.5) *
                                    (cellText?.fontSize ?? text?.fontSize ?? 16),
                            },
                          ],
                        },
                      ]}
                    >
                      │
                    </Text>
                  ) : null}
                </View>
              )
            })}
            {hasInputStyle ? (
              // TextInput's near-zero opacity is for autofill and invisible
              // glyphs, not its focus outline. Paint that input decoration
              // separately without adding a hit target or accessible field.
              <View
                pointerEvents="none"
                accessible={false}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={[inputBox, INPUT_FRAME]}
              />
            ) : null}
            <TextInput
              ref={input}
              value={code}
              onChangeText={change}
              onFocus={inputHandlers.focus}
              onBlur={() => {
                inputHandlers.blur()
                setSelection(null)
              }}
              onSelectionChange={(event) =>
                setSelection({ value: selectionValue.current, ...event.nativeEvent.selection })
              }
              onPointerDown={inputHandlers.pointerDown}
              onPressIn={inputHandlers.pointerDown}
              onKeyDown={inputHandlers.keyDown}
              keyboardType={type === 'number' ? 'number-pad' : 'default'}
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              autoCorrect={false}
              autoCapitalize="none"
              secureTextEntry={mask}
              maxLength={length * 2}
              autoFocus={autoFocus}
              editable={!disabled && !readOnly}
              readOnly={readOnly || disabled}
              accessibilityState={{ disabled: Boolean(disabled) }}
              caretHidden
              accessibilityLabel={accessibilityLabel}
              accessibilityHint={message('hozo.otpInput.hint', { length })}
              style={hasInputStyle ? [inputBox, inputText, INPUT_FRAME, INPUT] : INPUT}
            />
          </>
        )
      }}
    </Pressable>
  )
}

const ROW: ViewStyle = { flexDirection: 'row', alignSelf: 'flex-start' }
const CENTRED: ViewStyle = { alignItems: 'center', justifyContent: 'center' }
// Same fixed overlay geometry and transparent background as the Web input.
// Classes decorate it but cannot move the one field away from its cells.
const INPUT_FRAME: ViewStyle = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  width: '100%',
  height: '100%',
  margin: 0,
  marginTop: 0,
  marginBottom: 0,
  marginLeft: 0,
  marginRight: 0,
  marginStart: 0,
  marginEnd: 0,
  padding: 0,
  paddingTop: 0,
  paddingBottom: 0,
  paddingLeft: 0,
  paddingRight: 0,
  paddingStart: 0,
  paddingEnd: 0,
  borderTopWidth: 0,
  borderRightWidth: 0,
  borderBottomWidth: 0,
  borderLeftWidth: 0,
  backgroundColor: 'transparent',
}
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
