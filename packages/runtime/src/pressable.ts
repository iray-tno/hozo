import {
  createElement,
  forwardRef,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

import { type HozoDomStyle, hozoDomStyle } from './dom-style.ts'
import { hozoInteractive } from './interactive.ts'
import { HozoLink, type HozoLinkProps } from './link.ts'
import { type ResponderProps, useResponderDomProps } from './responder.ts'
import type { HozoLayoutEvent } from './view.ts'

export interface HozoPressableState {
  pressed: boolean
  hovered: boolean
  focused: boolean
}

type DivProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  | 'children'
  | 'onBlur'
  | 'onClick'
  | 'onFocus'
  | 'onPointerCancel'
  | 'onPointerDown'
  | 'onPointerEnter'
  | 'onPointerLeave'
  | 'onPointerUp'
  | 'style'
>

export interface HozoPressableProps extends DivProps, ResponderProps {
  children?: ReactNode | ((state: HozoPressableState) => ReactNode)
  style?: HozoDomStyle | ((state: HozoPressableState) => HozoDomStyle)
  onPress?: (event: MouseEvent<HTMLElement>) => void
  onClick?: (event: MouseEvent<HTMLElement>) => void
  onPressIn?: (event: PointerEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => void
  onPressOut?: (event: PointerEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => void
  onPointerCancel?: (event: PointerEvent<HTMLElement>) => void
  onPointerDown?: (event: PointerEvent<HTMLElement>) => void
  onPointerEnter?: (event: PointerEvent<HTMLElement>) => void
  onPointerLeave?: (event: PointerEvent<HTMLElement>) => void
  onPointerUp?: (event: PointerEvent<HTMLElement>) => void
  onHoverIn?: (event: PointerEvent<HTMLElement>) => void
  onHoverOut?: (event: PointerEvent<HTMLElement>) => void
  onFocus?: (event: React.FocusEvent<HTMLElement>) => void
  onBlur?: (event: React.FocusEvent<HTMLElement>) => void
  disabled?: boolean
  accessibilityRole?: string
  accessibilityLabel?: string
  accessibilityHint?: string
  accessibilityState?: {
    disabled?: boolean
    selected?: boolean
    checked?: boolean | 'mixed'
    busy?: boolean
    expanded?: boolean
  }
  accessibilityValue?: { min?: number; max?: number; now?: number; text?: string }
  accessibilityLiveRegion?: 'none' | 'polite' | 'assertive'
  testID?: string
  nativeID?: string
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only'
  onLayout?: (event: HozoLayoutEvent) => void
  dataSet?: Record<string, string | number | boolean | undefined>
  href?: string
  external?: boolean
  replace?: boolean
  prefetch?: boolean
  target?: string
  rel?: string
  download?: boolean | string
  accessible?: boolean
  accessibilityActions?: readonly unknown[]
  onAccessibilityAction?: (event: unknown) => void
  android_ripple?: unknown
  hitSlop?: unknown
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') ref(value)
  else if (ref) ref.current = value
}

function dataAttributes(dataSet: HozoPressableProps['dataSet']) {
  return Object.fromEntries(
    Object.entries(dataSet ?? {}).map(([key, value]) => [`data-${key}`, value]),
  )
}

/** A value-level Pressable for component props and animation wrappers. */
export const HozoPressable = forwardRef<HTMLElement, HozoPressableProps>(function HozoPressable(
  {
    accessibilityActions: _accessibilityActions,
    accessibilityHint,
    accessibilityLabel,
    accessibilityLiveRegion,
    accessibilityRole,
    accessibilityState,
    accessibilityValue,
    accessible: _accessible,
    android_ripple: _androidRipple,
    children,
    dataSet,
    disabled,
    download,
    external,
    hitSlop: _hitSlop,
    href,
    nativeID,
    onAccessibilityAction: _onAccessibilityAction,
    onBlur,
    onClick,
    onFocus,
    onHoverIn,
    onHoverOut,
    onPointerCancel,
    onPointerDown,
    onPointerEnter,
    onPointerLeave,
    onPointerUp,
    onPress,
    onPressIn,
    onPressOut,
    onKeyDown,
    onKeyUp,
    onLostPointerCapture,
    onLayout,
    onMoveShouldSetResponder,
    onMoveShouldSetResponderCapture,
    onResponderEnd,
    onResponderGrant,
    onResponderMove,
    onResponderReject,
    onResponderRelease,
    onResponderStart,
    onResponderTerminate,
    onResponderTerminationRequest,
    onStartShouldSetResponder,
    onStartShouldSetResponderCapture,
    pointerEvents,
    prefetch,
    rel,
    replace,
    role,
    style,
    target,
    testID,
    ...props
  },
  forwardedRef,
) {
  const elementRef = useRef<HTMLElement>(null)
  const layoutCallback = useRef(onLayout)
  layoutCallback.current = onLayout
  const pressedRef = useRef(false)
  const [state, setState] = useState<HozoPressableState>({
    pressed: false,
    hovered: false,
    focused: false,
  })
  const unavailable = disabled || accessibilityState?.disabled === true
  const setRef = useCallback(
    (element: HTMLElement | null) => {
      elementRef.current = element
      assignRef(forwardedRef, element)
    },
    [forwardedRef],
  )
  const responder = useResponderDomProps(
    elementRef,
    {
      onMoveShouldSetResponder,
      onMoveShouldSetResponderCapture,
      onResponderEnd,
      onResponderGrant,
      onResponderMove,
      onResponderReject,
      onResponderRelease,
      onResponderStart,
      onResponderTerminate,
      onResponderTerminationRequest,
      onStartShouldSetResponder,
      onStartShouldSetResponderCapture,
    },
    !unavailable,
  )
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
  const activate =
    onClick || onPress
      ? (event: MouseEvent<HTMLElement>) => {
          onClick?.(event)
          onPress?.(event)
        }
      : undefined
  const interaction = activate
    ? hozoInteractive(activate as never, unavailable)
    : {
        'aria-disabled': unavailable || undefined,
        'data-hozo-disabled': unavailable ? '' : undefined,
        tabIndex: undefined,
        onClick: undefined,
        onKeyDown: undefined,
        onKeyUp: undefined,
      }
  const pressIn = (event: PointerEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => {
    if (unavailable || pressedRef.current) return
    pressedRef.current = true
    setState((current) => ({ ...current, pressed: true }))
    onPressIn?.(event)
  }
  const pressOut = (event: PointerEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => {
    if (!pressedRef.current) return
    pressedRef.current = false
    setState((current) => ({ ...current, pressed: false }))
    onPressOut?.(event)
  }
  const resolvedChildren = typeof children === 'function' ? children(state) : children
  const resolvedStyle = hozoDomStyle(typeof style === 'function' ? style(state) : style)
  const value = accessibilityValue
  const common = {
    ...props,
    ...dataAttributes(dataSet),
    ref: setRef,
    role: accessibilityRole ?? role,
    style: resolvedStyle,
    id: nativeID,
    'data-testid': testID,
    'data-hozo-pointer-events': pointerEvents,
    'aria-label': accessibilityLabel,
    'aria-description': accessibilityHint,
    'aria-selected': accessibilityState?.selected,
    'aria-checked': accessibilityState?.checked,
    'aria-busy': accessibilityState?.busy,
    'aria-expanded': accessibilityState?.expanded,
    'aria-valuemin': value?.min,
    'aria-valuemax': value?.max,
    'aria-valuenow': value?.now,
    'aria-valuetext': value?.text,
    'aria-live': accessibilityLiveRegion === 'none' ? undefined : accessibilityLiveRegion,
    ...responder,
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.isPrimary) pressIn(event)
      responder.onPointerDown?.(event)
      onPointerDown?.(event as never)
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      pressOut(event)
      responder.onPointerUp?.(event)
      onPointerUp?.(event as never)
    },
    onPointerCancel: (event: PointerEvent<HTMLElement>) => {
      pressOut(event)
      responder.onPointerCancel?.(event)
      onPointerCancel?.(event as never)
    },
    onPointerEnter: (event: PointerEvent<HTMLElement>) => {
      if (!unavailable) setState((current) => ({ ...current, hovered: true }))
      onHoverIn?.(event)
      onPointerEnter?.(event as never)
    },
    onPointerLeave: (event: PointerEvent<HTMLElement>) => {
      pressOut(event)
      setState((current) => ({ ...current, hovered: false }))
      onHoverOut?.(event)
      onPointerLeave?.(event as never)
    },
    onFocus: (event: React.FocusEvent<HTMLElement>) => {
      if (!unavailable) setState((current) => ({ ...current, focused: true }))
      onFocus?.(event)
    },
    onBlur: (event: React.FocusEvent<HTMLElement>) => {
      pressOut(event as unknown as KeyboardEvent<HTMLElement>)
      setState((current) => ({ ...current, focused: false }))
      onBlur?.(event)
    },
    onLostPointerCapture: (event: PointerEvent<HTMLElement>) => {
      pressOut(event)
      responder.onLostPointerCapture?.(event)
      onLostPointerCapture?.(event as never)
    },
  }
  if (href != null) {
    return createElement(
      HozoLink,
      {
        ...common,
        ref: setRef as Ref<HTMLAnchorElement>,
        href,
        external,
        replace,
        prefetch,
        target,
        rel,
        download,
        disabled: unavailable,
        accessibilityRole,
        onPress: unavailable ? undefined : (activate as never),
        onKeyDown,
        onKeyUp,
      } as unknown as HozoLinkProps,
      resolvedChildren,
    )
  }
  return createElement(
    'div',
    {
      ...common,
      ...interaction,
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        if (event.key === 'Enter' || event.key === ' ') pressIn(event)
        interaction.onKeyDown?.(event)
        onKeyDown?.(event as never)
      },
      onKeyUp: (event: KeyboardEvent<HTMLElement>) => {
        if (event.key === 'Enter' || event.key === ' ') pressOut(event)
        interaction.onKeyUp?.(event)
        onKeyUp?.(event as never)
      },
    } as unknown as HTMLAttributes<HTMLDivElement>,
    resolvedChildren,
  )
})
