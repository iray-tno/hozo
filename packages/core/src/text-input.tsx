// The `TextInput` half of `@hozo/core`'s fallback primitives, kept in its
// own file because it carries an accessibility rule the others don't.
//
// See `./index.tsx` for why these fallbacks exist at all: the compiler's
// job is to make invoking them unnecessary where it can, not to make them
// required.
//
// Which means the two have to agree. When they didn't, this file was the
// one that was right: it has always mapped `onChangeText` onto `onChange`,
// while the compiler passed the prop straight to `<input>` and produced a
// field that reported nothing. The props below are the same set the
// compiler now translates, so an element that falls back behaves the way
// the compiled one would.

import type { ChangeEvent, ReactNode } from 'react'

/** The `inputmode` values the DOM has, which are also React Native's. */
type InputMode = 'none' | 'text' | 'decimal' | 'numeric' | 'tel' | 'search' | 'email' | 'url'

/** React Native's `keyboardType` values that name a kind of data. */
const INPUT_MODES: Record<string, InputMode> = {
  'number-pad': 'numeric',
  numeric: 'numeric',
  'decimal-pad': 'decimal',
  'email-address': 'email',
  'phone-pad': 'tel',
  url: 'url',
  'web-search': 'search',
}

export interface TextInputProps {
  className?: string
  value?: string
  placeholder?: string
  /**
   * The field's accessible name.
   *
   * Spelled the React Native way and mapped to `aria-label` here, so one
   * source spelling works on both platforms -- the same arrangement
   * `accessibilityRole` already has on `Pressable`.
   *
   * A `placeholder` is not a substitute (proposal §10.2): it may not be
   * announced as the field's name, and it disappears on the first
   * keystroke, which is exactly when someone would want to check what the
   * field was for. The compiler warns when this is missing.
   */
  accessibilityLabel?: string
  /** Additional guidance announced after the field's accessible name. */
  accessibilityHint?: string
  onChangeText?: (text: string) => void
  disabled?: boolean
  /** A `<textarea>` rather than an `<input>`. */
  multiline?: boolean
  /** The `<textarea>`'s `rows`. Nothing on a single-line field. */
  numberOfLines?: number
  /** React Native's older spelling of `readOnly`, and its negative. */
  editable?: boolean
  readOnly?: boolean
  secureTextEntry?: boolean
  /**
   * Which keyboard to ask for.
   *
   * The DOM names a kind of data rather than a keyboard, so the five
   * platform-specific values (`visible-password`, `twitter` and the rest)
   * have no equivalent and are ignored rather than approximated.
   */
  keyboardType?: string
  /** Takes precedence over `keyboardType`, which is React Native's rule. */
  inputMode?: InputMode
  children?: ReactNode
}

export function TextInput({
  className,
  value,
  placeholder,
  accessibilityLabel,
  accessibilityHint,
  onChangeText,
  disabled,
  multiline,
  numberOfLines,
  editable,
  readOnly,
  secureTextEntry,
  keyboardType,
  inputMode,
}: TextInputProps) {
  const shared = {
    className,
    value,
    placeholder,
    'aria-label': accessibilityLabel,
    'aria-description': accessibilityHint,
    disabled,
    // `editable={false}` and `readOnly` are one attribute under two
    // spellings, and React Native 0.87 has both.
    readOnly: readOnly ?? (editable === undefined ? undefined : !editable),
    inputMode: inputMode ?? (keyboardType ? INPUT_MODES[keyboardType] : undefined),
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChangeText?.(event.target.value),
  }

  // Not a prop on the DOM but a different element, which is why the
  // compiler reports a `multiline` it cannot resolve at build time. Here
  // there is nothing to resolve: the value is in hand.
  return multiline ? (
    <textarea {...shared} rows={numberOfLines} />
  ) : (
    <input {...shared} type={secureTextEntry ? 'password' : undefined} />
  )
}
