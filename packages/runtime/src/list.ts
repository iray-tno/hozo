import {
  createElement,
  forwardRef,
  type HTMLAttributes,
  isValidElement,
  type ReactElement,
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useRef,
} from 'react'

import { type HozoDomStyle, hozoDomStyle } from './dom-style.ts'
import type { HozoLayoutEvent } from './view.ts'

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

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') ref(value)
  else if (ref) ref.current = value
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

function renderSlot(slot: ReactNode | (() => ReactNode)) {
  if (typeof slot === 'function') return createElement(slot)
  return slot
}

interface SharedScrollableProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'onScroll' | 'style'> {
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

export interface HozoScrollViewProps extends SharedScrollableProps {}

export const HozoScrollView = forwardRef<HTMLDivElement, HozoScrollViewProps>(
  function HozoScrollView(
    {
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
      ...domProps
    },
    forwardedRef,
  ) {
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
    const nestedRefresh = refreshProps(refreshControl)
    const activeRefreshing = refreshing ?? nestedRefresh?.refreshing ?? false
    const activeRefresh = onRefresh ?? nestedRefresh?.onRefresh
    const hideScrollbar = horizontal
      ? !showsHorizontalScrollIndicator
      : !showsVerticalScrollIndicator
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
        onPointerDown: onScrollBeginDrag ? () => emitTo(onScrollBeginDrag) : undefined,
        onPointerUp: onScrollEndDrag ? () => emitTo(onScrollEndDrag) : undefined,
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
      createElement(
        'div',
        { ref: contentRef, style: hozoDomStyle(contentContainerStyle) },
        children,
      ),
    )
  },
)

export interface HozoFlatListRenderInfo<T> {
  item: T
  index: number
  separators: { highlight(): void; unhighlight(): void; updateProps(): void }
}

export interface HozoFlatListProps<T>
  extends Omit<SharedScrollableProps, 'children' | 'onContentSizeChange'> {
  data: readonly T[] | null | undefined
  renderItem: (info: HozoFlatListRenderInfo<T>) => ReactNode
  keyExtractor?: (item: T, index: number) => string
  ListHeaderComponent?: ReactNode | (() => ReactNode)
  ListFooterComponent?: ReactNode | (() => ReactNode)
  ListEmptyComponent?: ReactNode | (() => ReactNode)
  ItemSeparatorComponent?: ReactNode | (() => ReactNode)
  numColumns?: number
  onEndReached?: (info: { distanceFromEnd: number }) => void
  onEndReachedThreshold?: number
  initialNumToRender?: number
  removeClippedSubviews?: boolean
}

export interface HozoFlatListHandle extends HTMLDivElement {
  scrollToOffset(options: { offset: number; animated?: boolean }): void
  scrollToEnd(options?: { animated?: boolean }): void
  scrollToIndex(options: { index: number; animated?: boolean; viewOffset?: number }): void
}

const separators = { highlight() {}, unhighlight() {}, updateProps() {} }

function HozoFlatListInner<T>(props: HozoFlatListProps<T>, forwardedRef: Ref<HozoFlatListHandle>) {
  const {
    data = [],
    renderItem,
    keyExtractor,
    ListHeaderComponent,
    ListFooterComponent,
    ListEmptyComponent,
    ItemSeparatorComponent,
    numColumns = 1,
    horizontal,
    contentContainerStyle,
    onEndReached,
    onEndReachedThreshold = 0,
    initialNumToRender: _initialNumToRender,
    removeClippedSubviews: _removeClippedSubviews,
    ...scrollProps
  } = props
  const endRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HozoFlatListHandle>(null)
  const itemsData = data ?? []
  const setRoot = useCallback(
    (element: HTMLDivElement | null) => {
      if (element) {
        const handle = element as HozoFlatListHandle
        handle.scrollToOffset = ({ offset, animated }) =>
          handle.scrollTo({
            [horizontal ? 'left' : 'top']: offset,
            behavior: animated ? 'smooth' : 'auto',
          })
        handle.scrollToEnd = ({ animated } = {}) =>
          handle.scrollTo({
            [horizontal ? 'left' : 'top']: horizontal ? handle.scrollWidth : handle.scrollHeight,
            behavior: animated ? 'smooth' : 'auto',
          })
        handle.scrollToIndex = ({ index, animated, viewOffset = 0 }) => {
          const item = handle.querySelector<HTMLElement>(`[data-hozo-list-index="${index}"]`)
          if (!item) return
          handle.scrollTo({
            [horizontal ? 'left' : 'top']:
              (horizontal ? item.offsetLeft : item.offsetTop) - viewOffset,
            behavior: animated ? 'smooth' : 'auto',
          })
        }
        rootRef.current = handle
        assignRef(forwardedRef, handle)
      } else {
        rootRef.current = null
        assignRef(forwardedRef, null)
      }
    },
    [forwardedRef, horizontal],
  )

  useEffect(() => {
    const root = rootRef.current
    const target = endRef.current
    if (
      !root ||
      !target ||
      !onEndReached ||
      itemsData.length === 0 ||
      typeof IntersectionObserver === 'undefined'
    )
      return
    let fired = false
    const margin = `${Math.max(0, onEndReachedThreshold) * 100}%`
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || fired) return
        fired = true
        observer.disconnect()
        onEndReached({ distanceFromEnd: 0 })
      },
      { root, rootMargin: horizontal ? `0px ${margin} 0px 0px` : `0px 0px ${margin} 0px` },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [itemsData.length, horizontal, onEndReached, onEndReachedThreshold])

  const items: ReactNode[] = []
  itemsData.forEach((item, index) => {
    items.push(
      createElement(
        'div',
        {
          key: keyExtractor?.(item, index) ?? index,
          role: 'listitem',
          'data-hozo-list-index': index,
        },
        renderItem({ item, index, separators }),
      ),
    )
    if (index < itemsData.length - 1 && ItemSeparatorComponent) {
      items.push(
        createElement(
          'div',
          { key: `separator-${index}`, role: 'presentation' },
          renderSlot(ItemSeparatorComponent),
        ),
      )
    }
  })

  return createElement(
    HozoScrollView,
    { ...scrollProps, horizontal, contentContainerStyle, ref: setRoot },
    renderSlot(ListHeaderComponent),
    itemsData.length === 0 ? renderSlot(ListEmptyComponent) : null,
    itemsData.length > 0
      ? createElement(
          'div',
          {
            role: 'list',
            style:
              numColumns > 1
                ? { display: 'grid', gridTemplateColumns: `repeat(${numColumns}, minmax(0, 1fr))` }
                : horizontal
                  ? { display: 'flex', flexDirection: 'row' }
                  : undefined,
          },
          items,
        )
      : null,
    renderSlot(ListFooterComponent),
    createElement('div', { ref: endRef, 'aria-hidden': true }),
  )
}

export const HozoFlatList = forwardRef(HozoFlatListInner) as <T>(
  props: HozoFlatListProps<T> & { ref?: Ref<HozoFlatListHandle> },
) => ReactElement
