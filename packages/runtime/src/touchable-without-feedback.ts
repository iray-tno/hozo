import {
  Children,
  cloneElement,
  forwardRef,
  type HTMLAttributes,
  isValidElement,
  type ReactElement,
} from 'react'

export interface HozoTouchableWithoutFeedbackProps
  extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  children: ReactElement
  testID?: string
  nativeID?: string
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only'
  accessibilityLabel?: string
  accessibilityHint?: string
  accessibilityRole?: string
  accessibilityState?: {
    disabled?: boolean
    selected?: boolean
    checked?: boolean | 'mixed'
    busy?: boolean
    expanded?: boolean
  }
  accessibilityValue?: { min?: number; max?: number; now?: number; text?: string }
  accessibilityLiveRegion?: 'none' | 'polite' | 'assertive'
  disabled?: boolean
  'data-hozo-disabled'?: string
}

/**
 * Adds interaction to one existing child, matching React Native's deliberate
 * no-layout-wrapper contract.
 */
export const HozoTouchableWithoutFeedback = forwardRef<
  HTMLElement,
  HozoTouchableWithoutFeedbackProps
>(function HozoTouchableWithoutFeedback(
  {
    children,
    testID,
    nativeID,
    pointerEvents,
    accessibilityLabel,
    accessibilityHint,
    accessibilityRole,
    accessibilityState,
    accessibilityValue,
    accessibilityLiveRegion,
    disabled = false,
    role,
    'aria-disabled': ariaDisabled,
    'data-hozo-disabled': dataHozoDisabled,
    onClick,
    ...props
  },
  ref,
) {
  const child = Children.only(children)
  if (!isValidElement<Record<string, unknown>>(child)) return child

  const unavailable = disabled || accessibilityState?.disabled === true
  const value = accessibilityValue
  const clonedProps: Record<string, unknown> = {
    ...props,
    role: accessibilityRole ?? role,
    'data-testid': testID,
    id: nativeID,
    'data-hozo-pointer-events': pointerEvents,
    'data-hozo-disabled': unavailable ? '' : dataHozoDisabled,
    'aria-disabled': unavailable ? true : ariaDisabled,
    'aria-selected': accessibilityState?.selected,
    'aria-checked': accessibilityState?.checked,
    'aria-busy': accessibilityState?.busy,
    'aria-expanded': accessibilityState?.expanded,
    'aria-valuemin': value?.min,
    'aria-valuemax': value?.max,
    'aria-valuenow': value?.now,
    'aria-valuetext': value?.text,
    'aria-live': accessibilityLiveRegion === 'none' ? undefined : accessibilityLiveRegion,
    'aria-label': accessibilityLabel,
    'aria-description': accessibilityHint,
    onClick: unavailable ? undefined : onClick,
  }
  if (ref != null) clonedProps.ref = ref
  return cloneElement(child, clonedProps)
})
