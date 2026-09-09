import {
  createElement,
  forwardRef,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useRef,
} from 'react'

import { type HozoDomStyle, hozoDomStyle } from './dom-style.ts'
import { type ResponderProps, useResponderDomProps } from './responder.ts'

export interface HozoLayoutEvent {
  nativeEvent: { layout: { x: number; y: number; width: number; height: number } }
}

export interface HozoViewProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'style'>,
    ResponderProps {
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
  onLayout?: (event: HozoLayoutEvent) => void
  collapsable?: boolean
  'data-hozo-disabled'?: string
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') ref(value)
  else if (ref) ref.current = value
}

/** A measured/responder-aware View for the Web paths that cannot be a plain div. */
export const HozoView = forwardRef<HTMLDivElement, HozoViewProps>(function HozoView(
  {
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
    onLayout,
    collapsable: _collapsable,
    role,
    'aria-disabled': ariaDisabled,
    'data-hozo-disabled': dataHozoDisabled,
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
  const elementRef = useRef<HTMLDivElement>(null)
  const layoutCallback = useRef(onLayout)
  layoutCallback.current = onLayout
  const setRef = useCallback(
    (element: HTMLDivElement | null) => {
      elementRef.current = element
      assignRef(forwardedRef, element)
    },
    [forwardedRef],
  )
  const responder = useResponderDomProps(elementRef, {
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
  })

  useEffect(() => {
    const element = elementRef.current
    if (!element || !layoutCallback.current) return
    let previous = ''
    const emit = () => {
      const rect = element.getBoundingClientRect()
      const layout = {
        x: element.offsetLeft,
        y: element.offsetTop,
        width: rect.width,
        height: rect.height,
      }
      const key = `${layout.x}:${layout.y}:${layout.width}:${layout.height}`
      if (key === previous) return
      previous = key
      layoutCallback.current?.({ nativeEvent: { layout } })
    }
    emit()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(emit)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const state = accessibilityState
  const value = accessibilityValue
  return createElement(
    'div',
    {
      ...props,
      ...responder,
      ref: setRef,
      role: accessibilityRole ?? role,
      style: hozoDomStyle(style),
      'data-testid': testID,
      id: nativeID,
      'data-hozo-pointer-events': pointerEvents,
      'data-hozo-disabled': state?.disabled ? '' : dataHozoDisabled,
      'aria-disabled': state?.disabled ? true : ariaDisabled,
      'aria-selected': state?.selected,
      'aria-checked': state?.checked,
      'aria-busy': state?.busy,
      'aria-expanded': state?.expanded,
      'aria-valuemin': value?.min,
      'aria-valuemax': value?.max,
      'aria-valuenow': value?.now,
      'aria-valuetext': value?.text,
      'aria-live': accessibilityLiveRegion === 'none' ? undefined : accessibilityLiveRegion,
      'aria-label': accessibilityLabel,
      'aria-description': accessibilityHint,
    },
    children,
  )
})
