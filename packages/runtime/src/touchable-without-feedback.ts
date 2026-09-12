import {
  Children,
  cloneElement,
  forwardRef,
  type HTMLAttributes,
  type PointerEvent,
  type ReactElement,
  type Ref,
  useCallback,
  useRef,
} from 'react'

import { type ResponderProps, useResponderDomProps } from './responder.ts'

export interface HozoTouchableWithoutFeedbackProps
  extends Omit<HTMLAttributes<HTMLElement>, 'children'>,
    ResponderProps {
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

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') ref(value)
  else if (ref) ref.current = value
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
    onPointerDown,
    onPointerDownCapture,
    onPointerMove,
    onPointerMoveCapture,
    onPointerUp,
    onPointerCancel,
    onLostPointerCapture,
    onStartShouldSetResponder,
    onStartShouldSetResponderCapture,
    onMoveShouldSetResponder,
    onMoveShouldSetResponderCapture,
    onResponderGrant,
    onResponderStart,
    onResponderMove,
    onResponderEnd,
    onResponderRelease,
    onResponderReject,
    onResponderTerminate,
    onResponderTerminationRequest,
    ...props
  },
  forwardedRef,
) {
  const child = Children.only(children) as ReactElement<Record<string, unknown>>
  const elementRef = useRef<HTMLElement>(null)
  const childRef = child.props.ref as Ref<HTMLElement> | undefined
  const setRef = useCallback(
    (element: HTMLElement | null) => {
      elementRef.current = element
      assignRef(childRef, element)
      assignRef(forwardedRef, element)
    },
    [childRef, forwardedRef],
  )
  const unavailable = disabled || accessibilityState?.disabled === true
  const value = accessibilityValue
  const responder = useResponderDomProps(
    elementRef,
    {
      onStartShouldSetResponder,
      onStartShouldSetResponderCapture,
      onMoveShouldSetResponder,
      onMoveShouldSetResponderCapture,
      onResponderGrant,
      onResponderStart,
      onResponderMove,
      onResponderEnd,
      onResponderRelease,
      onResponderReject,
      onResponderTerminate,
      onResponderTerminationRequest,
    },
    !unavailable,
  )
  const adoptTarget = (event: PointerEvent<HTMLElement>) => {
    elementRef.current ??= event.currentTarget
  }
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
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      adoptTarget(event)
      responder.onPointerDown?.(event)
      onPointerDown?.(event)
    },
    onPointerDownCapture: (event: PointerEvent<HTMLElement>) => {
      adoptTarget(event)
      responder.onPointerDownCapture?.(event)
      onPointerDownCapture?.(event)
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      adoptTarget(event)
      responder.onPointerMove?.(event)
      onPointerMove?.(event)
    },
    onPointerMoveCapture: (event: PointerEvent<HTMLElement>) => {
      adoptTarget(event)
      responder.onPointerMoveCapture?.(event)
      onPointerMoveCapture?.(event)
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      adoptTarget(event)
      responder.onPointerUp?.(event)
      onPointerUp?.(event)
    },
    onPointerCancel: (event: PointerEvent<HTMLElement>) => {
      adoptTarget(event)
      responder.onPointerCancel?.(event)
      onPointerCancel?.(event)
    },
    onLostPointerCapture: (event: PointerEvent<HTMLElement>) => {
      adoptTarget(event)
      responder.onLostPointerCapture?.(event)
      onLostPointerCapture?.(event)
    },
  }
  clonedProps.ref = setRef
  return cloneElement(child, clonedProps)
})
