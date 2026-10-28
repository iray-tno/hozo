import type { AccessibilityState } from 'react-native'

interface DisabledOwner {
  disabled?: boolean | null
  accessibilityState?: AccessibilityState | null
}

type DisabledResult<T extends DisabledOwner> = Omit<T, keyof DisabledOwner> & {
  disabled?: T['disabled'] | boolean
  accessibilityState?: T['accessibilityState'] | AccessibilityState
}

/** Keep behavior and announcement on the same canonical unavailable fact. */
export function nativeDisabledProps<T extends DisabledOwner>(props: T): DisabledResult<T> {
  const state = props.accessibilityState
  const flag = props.disabled
  const stateDisabled = state?.disabled === true
  const disabled = Boolean(flag || stateDisabled)
  // Ordinary enabled controls and already-normalized compiled props need
  // neither a new props object nor a second accessibility-state object.
  if (!disabled || (flag === true && stateDisabled)) return props
  return { ...props, disabled, accessibilityState: stateDisabled ? state : { ...state, disabled } }
}
