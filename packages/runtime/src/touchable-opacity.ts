import {
  createElement,
  forwardRef,
  type HTMLAttributes,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useState,
} from 'react'

import { type HozoDomStyle, hozoDomStyle } from './dom-style.ts'

export interface HozoTouchableOpacityProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'style'> {
  activeOpacity?: number
  children?: ReactNode
  style?: HozoDomStyle
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

/** React Native TouchableOpacity feedback without retaining React Native Web. */
export const HozoTouchableOpacity = forwardRef<HTMLDivElement, HozoTouchableOpacityProps>(
  function HozoTouchableOpacity(
    {
      activeOpacity = 0.2,
      children,
      style,
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
      onPointerUp,
      onPointerCancel,
      onPointerLeave,
      onKeyDown,
      onKeyUp,
      onBlur,
      ...props
    },
    ref,
  ) {
    const [pressed, setPressed] = useState(false)
    const unavailable = disabled || accessibilityState?.disabled === true
    const value = accessibilityValue

    const pressIn = (event: PointerEvent<HTMLDivElement>) => {
      if (!unavailable && event.isPrimary) setPressed(true)
      onPointerDown?.(event)
    }
    const pressOut = (event: PointerEvent<HTMLDivElement>) => {
      setPressed(false)
      onPointerUp?.(event)
    }
    const cancel = (event: PointerEvent<HTMLDivElement>) => {
      setPressed(false)
      onPointerCancel?.(event)
    }
    const leave = (event: PointerEvent<HTMLDivElement>) => {
      setPressed(false)
      onPointerLeave?.(event)
    }
    const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
      if (!unavailable && (event.key === 'Enter' || event.key === ' ')) setPressed(true)
      onKeyDown?.(event)
    }
    const keyUp = (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Enter' || event.key === ' ') setPressed(false)
      onKeyUp?.(event)
    }

    return createElement(
      'div',
      {
        ...props,
        ref,
        role: accessibilityRole ?? role,
        style: hozoDomStyle([style, pressed ? { opacity: activeOpacity } : undefined]),
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
        onPointerDown: pressIn,
        onPointerUp: pressOut,
        onPointerCancel: cancel,
        onPointerLeave: leave,
        onKeyDown: keyDown,
        onKeyUp: keyUp,
        onBlur: (event) => {
          setPressed(false)
          onBlur?.(event)
        },
      },
      children,
    )
  },
)
