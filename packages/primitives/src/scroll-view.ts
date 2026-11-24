import {
  type HozoDomStyle,
  hozoDomStyle,
  type ResponderProps,
  useResponderDomProps,
} from '@hozo/engine'
import {
  createElement,
  type HTMLAttributes,
  isValidElement,
  type ReactElement,
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useRef,
} from 'react'
import type { HozoLayoutEvent } from './foundation.tsx'

export interface HozoScrollEvent {
  nativeEvent: {
    contentOffset: { x: number; y: number }
    contentSize: { width: number; height: number }
    layoutMeasurement: { width: number; height: number }
  }
}

export interface HozoRefreshControlProps {
  refreshing: boolean
  onRefresh?: () => void
  tintColor?: string
  titleColor?: string
  progressViewOffset?: number
}

/** A portable refresh intent. Hozo lists consume it; standalone use stays operable. */
export function HozoRefreshControl({ refreshing, onRefresh }: HozoRefreshControlProps) {
  return createElement(
    'button',
    {
      type: 'button',
      disabled: refreshing || !onRefresh,
      onClick: onRefresh,
      'aria-busy': refreshing || undefined,
      'data-hozo-refresh-control': '',
    },
    refreshing ? 'Refreshing…' : 'Refresh',
  )
}

export function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') ref(value)
  else if (ref) ref.current = value
}

export function renderSlot(slot: ReactNode | (() => ReactNode)) {
  if (typeof slot === 'function') return createElement(slot)
  return slot
}

function nativeScrollEvent(element: HTMLElement): HozoScrollEvent {
  return {
    nativeEvent: {
      contentOffset: { x: element.scrollLeft, y: element.scrollTop },
      contentSize: { width: element.scrollWidth, height: element.scrollHeight },
      layoutMeasurement: { width: element.clientWidth, height: element.clientHeight },
    },
  }
}

function refreshProps(control: ReactNode): HozoRefreshControlProps | undefined {
  return isValidElement(control) && control.type === HozoRefreshControl
    ? (control.props as HozoRefreshControlProps)
    : undefined
}

export interface SharedScrollableProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'onScroll' | 'style'>,
    ResponderProps {
  children?: ReactNode
  style?: HozoDomStyle
  contentContainerStyle?: HozoDomStyle
  horizontal?: boolean
  refreshing?: boolean
  onRefresh?: () => void
  refreshControl?: ReactElement<HozoRefreshControlProps>
  showsVerticalScrollIndicator?: boolean
  showsHorizontalScrollIndicator?: boolean
  onScroll?: (event: HozoScrollEvent) => void
  scrollEventThrottle?: number
  onScrollBeginDrag?: (event: HozoScrollEvent) => void
  onScrollEndDrag?: (event: HozoScrollEvent) => void
  onMomentumScrollEnd?: (event: HozoScrollEvent) => void
  onContentSizeChange?: (width: number, height: number) => void
  onLayout?: (event: HozoLayoutEvent) => void
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
  keyboardShouldPersistTaps?: 'always' | 'never' | 'handled'
  stickyHeaderIndices?: readonly number[]
  contentInsetAdjustmentBehavior?: string
  automaticallyAdjustKeyboardInsets?: boolean
  bounces?: boolean
  pagingEnabled?: boolean
  directionalLockEnabled?: boolean
  nestedScrollEnabled?: boolean
  alwaysBounceVertical?: boolean
  overScrollMode?: string
  snapToOffsets?: readonly number[]
  snapToEnd?: boolean
}

function useMeasurements(
  rootRef: React.RefObject<HTMLDivElement | null>,
  contentRef: React.RefObject<HTMLDivElement | null>,
  onLayout: SharedScrollableProps['onLayout'],
  onContentSizeChange: SharedScrollableProps['onContentSizeChange'],
) {
  const layoutRef = useRef(onLayout)
  const contentSizeRef = useRef(onContentSizeChange)
  layoutRef.current = onLayout
  contentSizeRef.current = onContentSizeChange

  useEffect(() => {
    const root = rootRef.current
    const content = contentRef.current
    if (!root || !content) return
    let lastLayout = ''
    let lastContent = ''
    const emit = () => {
      const rect = root.getBoundingClientRect()
      const layout = {
        x: root.offsetLeft,
        y: root.offsetTop,
        width: rect.width,
        height: rect.height,
      }
      const layoutKey = `${layout.x}:${layout.y}:${layout.width}:${layout.height}`
      if (layoutKey !== lastLayout) {
        lastLayout = layoutKey
        layoutRef.current?.({ nativeEvent: { layout } })
      }
      const contentRect = content.getBoundingClientRect()
      const contentKey = `${contentRect.width}:${contentRect.height}`
      if (contentKey !== lastContent) {
        lastContent = contentKey
        contentSizeRef.current?.(contentRect.width, contentRect.height)
      }
    }
    emit()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(emit)
    observer.observe(root)
    observer.observe(content)
    return () => observer.disconnect()
  }, [rootRef, contentRef])
}

export interface HozoScrollViewProps extends SharedScrollableProps {
  /** Declared here, because React 19 takes `ref` as an ordinary prop. */
  ref?: Ref<HTMLDivElement>
}

export function HozoScrollView({
  ref: forwardedRef,
  children,
  className,
  style,
  contentContainerStyle,
  horizontal,
  refreshing,
  onRefresh,
  refreshControl,
  showsVerticalScrollIndicator = true,
  showsHorizontalScrollIndicator = true,
  onScroll,
  scrollEventThrottle = 0,
  onScrollBeginDrag,
  onScrollEndDrag,
  onMomentumScrollEnd,
  onContentSizeChange,
  onLayout,
  testID,
  nativeID,
  pointerEvents,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole,
  accessibilityState,
  accessibilityValue,
  accessibilityLiveRegion,
  keyboardShouldPersistTaps: _keyboardShouldPersistTaps,
  stickyHeaderIndices: _stickyHeaderIndices,
  contentInsetAdjustmentBehavior: _contentInsetAdjustmentBehavior,
  automaticallyAdjustKeyboardInsets: _automaticallyAdjustKeyboardInsets,
  bounces: _bounces,
  pagingEnabled: _pagingEnabled,
  directionalLockEnabled: _directionalLockEnabled,
  nestedScrollEnabled: _nestedScrollEnabled,
  alwaysBounceVertical: _alwaysBounceVertical,
  overScrollMode: _overScrollMode,
  snapToOffsets: _snapToOffsets,
  snapToEnd: _snapToEnd,
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
  ...domProps
}: HozoScrollViewProps): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const lastScroll = useRef(0)
  const setRoot = useCallback(
    (element: HTMLDivElement | null) => {
      rootRef.current = element
      assignRef(forwardedRef, element)
    },
    [forwardedRef],
  )
  useMeasurements(rootRef, contentRef, onLayout, onContentSizeChange)
  const responderProps = {
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
  }
  const hasResponderContract = Object.values(responderProps).some(Boolean)
  const responder = useResponderDomProps(
    rootRef,
    responderProps,
    hasResponderContract && accessibilityState?.disabled !== true,
  )
  const nestedRefresh = refreshProps(refreshControl)
  const activeRefreshing = refreshing ?? nestedRefresh?.refreshing ?? false
  const activeRefresh = onRefresh ?? nestedRefresh?.onRefresh
  const hideScrollbar = horizontal ? !showsHorizontalScrollIndicator : !showsVerticalScrollIndicator
  const viewport = horizontal
    ? { overflowX: 'auto' as const, overflowY: 'hidden' as const }
    : { overflowX: 'hidden' as const, overflowY: 'auto' as const }
  const emitScroll = () => (rootRef.current ? nativeScrollEvent(rootRef.current) : undefined)
  const emitTo = (callback: ((event: HozoScrollEvent) => void) | undefined) => {
    const event = emitScroll()
    if (event) callback?.(event)
  }

  return createElement(
    'div',
    {
      ...domProps,
      ref: setRoot,
      className,
      id: nativeID,
      'data-testid': testID,
      role: accessibilityRole ?? domProps.role,
      'data-hozo-pointer-events': pointerEvents,
      'data-hozo-disabled': accessibilityState?.disabled ? '' : undefined,
      'data-hozo-horizontal': horizontal ? '' : undefined,
      'data-hozo-hide-scrollbar': hideScrollbar ? '' : undefined,
      'aria-label': accessibilityLabel,
      'aria-description': accessibilityHint,
      'aria-disabled': accessibilityState?.disabled,
      'aria-selected': accessibilityState?.selected,
      'aria-checked': accessibilityState?.checked,
      'aria-busy': accessibilityState?.busy || activeRefreshing || undefined,
      'aria-expanded': accessibilityState?.expanded,
      'aria-valuemin': accessibilityValue?.min,
      'aria-valuemax': accessibilityValue?.max,
      'aria-valuenow': accessibilityValue?.now,
      'aria-valuetext': accessibilityValue?.text,
      'aria-live': accessibilityLiveRegion === 'none' ? undefined : accessibilityLiveRegion,
      style: { ...viewport, ...hozoDomStyle(style) },
      onPointerDown:
        onScrollBeginDrag || responder.onPointerDown || onPointerDown
          ? (event) => {
              emitTo(onScrollBeginDrag)
              responder.onPointerDown?.(event)
              onPointerDown?.(event)
            }
          : undefined,
      onPointerDownCapture:
        responder.onPointerDownCapture || onPointerDownCapture
          ? (event) => {
              responder.onPointerDownCapture?.(event)
              onPointerDownCapture?.(event)
            }
          : undefined,
      onPointerMove:
        responder.onPointerMove || onPointerMove
          ? (event) => {
              responder.onPointerMove?.(event)
              onPointerMove?.(event)
            }
          : undefined,
      onPointerMoveCapture:
        responder.onPointerMoveCapture || onPointerMoveCapture
          ? (event) => {
              responder.onPointerMoveCapture?.(event)
              onPointerMoveCapture?.(event)
            }
          : undefined,
      onPointerUp:
        onScrollEndDrag || responder.onPointerUp || onPointerUp
          ? (event) => {
              emitTo(onScrollEndDrag)
              responder.onPointerUp?.(event)
              onPointerUp?.(event)
            }
          : undefined,
      onPointerCancel:
        responder.onPointerCancel || onPointerCancel
          ? (event) => {
              responder.onPointerCancel?.(event)
              onPointerCancel?.(event)
            }
          : undefined,
      onLostPointerCapture:
        responder.onLostPointerCapture || onLostPointerCapture
          ? (event) => {
              responder.onLostPointerCapture?.(event)
              onLostPointerCapture?.(event)
            }
          : undefined,
      onScroll: () => {
        const now = Date.now()
        const event = emitScroll()
        if (!event) return
        if (
          onScroll &&
          (scrollEventThrottle <= 0 || now - lastScroll.current >= scrollEventThrottle)
        ) {
          lastScroll.current = now
          onScroll(event)
        }
      },
      onScrollEnd: onMomentumScrollEnd ? () => emitTo(onMomentumScrollEnd) : undefined,
    },
    activeRefresh
      ? createElement(HozoRefreshControl, {
          refreshing: activeRefreshing,
          onRefresh: activeRefresh,
        })
      : null,
    createElement('div', { ref: contentRef, style: hozoDomStyle(contentContainerStyle) }, children),
  )
}
