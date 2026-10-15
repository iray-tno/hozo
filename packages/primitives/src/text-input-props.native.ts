import type { TextInputProps as RNTextInputProps } from 'react-native'

/** Canonical disabled is distinct from an editable/read-only field. */
export interface NativeTextInputProps extends RNTextInputProps {
  disabled?: boolean
  className?: string
  'aria-invalid'?: boolean | 'false' | 'true' | 'grammar' | 'spelling'
}

/** Shared by value-level and generated hosts; RN has no disabled input prop. */
export function nativeTextInputProps({
  disabled,
  'aria-invalid': _invalid,
  ...props
}: NativeTextInputProps): RNTextInputProps {
  if (!disabled) return props
  // Both RN spellings must prevent editing even if the caller authored
  // readOnly=false. Do not turn ordinary read-only fields into disabled ones.
  return {
    ...props,
    editable: false,
    readOnly: true,
    accessibilityState: { ...props.accessibilityState, disabled: true },
    'aria-disabled': true,
  }
}
