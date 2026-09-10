import {
  type ChangeEvent,
  type ChangeEventHandler,
  createElement,
  forwardRef,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react'

import { type HozoDomStyle, hozoDomStyle } from './dom-style.ts'

type InputMode = 'none' | 'text' | 'decimal' | 'numeric' | 'tel' | 'search' | 'email' | 'url'

const INPUT_MODES: Record<string, InputMode> = {
  'number-pad': 'numeric',
  numeric: 'numeric',
  'decimal-pad': 'decimal',
  'email-address': 'email',
  'phone-pad': 'tel',
  url: 'url',
  'web-search': 'search',
}

type DomInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'children' | 'onChange' | 'onKeyDown' | 'readOnly' | 'size' | 'style' | 'value'
>

export interface HozoTextInputProps extends DomInputProps {
  children?: ReactNode
  value?: string
  style?: HozoDomStyle
  accessibilityLabel?: string
  accessibilityHint?: string
  accessibilityLabelledBy?: string
  testID?: string
  nativeID?: string
  onChange?: ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement>
  onChangeText?: (text: string) => void
  onKeyPress?: (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void
  onSubmitEditing?: (event: { nativeEvent: { text: string } }) => void
  editable?: boolean
  readOnly?: boolean
  multiline?: boolean
  numberOfLines?: number
  secureTextEntry?: boolean
  keyboardType?: string
  inputMode?: InputMode
  returnKeyType?: string
  blurOnSubmit?: boolean
  placeholderTextColor?: string
  selectionColor?: string
  cursorColor?: string
  keyboardAppearance?: string
  hitSlop?: unknown
}

/** A value-level TextInput for factories and other code the JSX compiler cannot rewrite. */
export const HozoTextInput = forwardRef<HTMLInputElement | HTMLTextAreaElement, HozoTextInputProps>(
  function HozoTextInput(
    {
      accessibilityHint,
      accessibilityLabel,
      accessibilityLabelledBy,
      blurOnSubmit,
      cursorColor,
      editable,
      hitSlop: _hitSlop,
      inputMode,
      keyboardAppearance: _keyboardAppearance,
      keyboardType,
      multiline,
      nativeID,
      numberOfLines,
      onChange,
      onChangeText,
      onKeyPress,
      onSubmitEditing,
      placeholderTextColor: _placeholderTextColor,
      readOnly,
      returnKeyType,
      secureTextEntry,
      selectionColor,
      style,
      testID,
      value,
      ...props
    },
    ref,
  ) {
    const change = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onChange?.(event)
      onChangeText?.(event.currentTarget.value)
    }
    const keyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onKeyPress?.(event)
      if (event.key !== 'Enter' || !onSubmitEditing) return
      if (!multiline || blurOnSubmit) {
        onSubmitEditing({ nativeEvent: { text: event.currentTarget.value } })
        if (blurOnSubmit) event.currentTarget.blur()
      }
    }
    const resolvedStyle = hozoDomStyle([
      style,
      cursorColor || selectionColor ? { caretColor: cursorColor ?? selectionColor } : undefined,
    ])
    const shared = {
      ...props,
      id: nativeID,
      value,
      readOnly: readOnly ?? (editable === undefined ? undefined : !editable),
      inputMode: inputMode ?? (keyboardType ? INPUT_MODES[keyboardType] : undefined),
      enterKeyHint: returnKeyType as InputHTMLAttributes<HTMLInputElement>['enterKeyHint'],
      style: resolvedStyle,
      'aria-label': accessibilityLabel,
      'aria-description': accessibilityHint,
      'aria-labelledby': accessibilityLabelledBy,
      'data-testid': testID,
      onChange: change,
      onKeyDown: keyDown,
    }
    return createElement(multiline ? 'textarea' : 'input', {
      ...shared,
      ref,
      rows: multiline ? numberOfLines : undefined,
      type: multiline ? undefined : secureTextEntry ? 'password' : props.type,
    })
  },
)
