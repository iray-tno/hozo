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
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { type HozoDomStyle, hozoDomStyle } from './dom-style.ts'
import { type ResponderProps, useResponderDomProps } from './responder.ts'
import type { HozoLayoutEvent } from './view.ts'
import {
  type Anchor,
  anchorRow,
  initialRange,
  ListMetrics,
  type MaintainVisibleContentPosition,
  windowRange,
  withFocus,
} from './windowing.ts'

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

/** React Native's `getItemLayout` result: a row's size and position, already known. */
export interface HozoFlatListLayout {
  length: number
  offset: number
  index: number
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
  /** In viewport lengths, as React Native measures it. Its default is 2. */
  onEndReachedThreshold?: number
  /** Rows to mount before the viewport has been measured. */
  initialNumToRender?: number
  /** `(windowSize - 1)` viewports of overscan, split half each way. */
  windowSize?: number
  /** A cap on how many *new* rows one pass may mount. */
  maxToRenderPerBatch?: number
  /**
   * Exact geometry, when the caller already has it.
   *
   * Believed rather than measured, which is the whole reason React Native
   * offers it: `scrollToIndex` to an unmeasured row is otherwise a guess
   * followed by a correction. With `numColumns > 1` it describes *items*
   * and the list windows *rows*, so only its `length` is used there and the
   * row offsets are still summed here.
   */
  getItemLayout?: (data: readonly T[] | null | undefined, index: number) => HozoFlatListLayout
  /**
   * What a row is assumed to be until one has been measured.
   *
   * Only the first paint depends on it: the mean of the measured rows takes
   * over as soon as there are any. A number in the right order of magnitude
   * is worth more than an exact one.
   */
  estimatedItemSize?: number
  /**
   * Row 0 at the bottom, and `scrollToOffset(0)` with it.
   *
   * A mirror transform on the scroller and on each row, which is how
   * `react-native-web` does it: layout, scroll offsets and measurement all
   * stay in list space, so nothing else in this file has to know.
   */
  inverted?: boolean
  /** Holds the reader's place when rows are inserted above them. */
  maintainVisibleContentPosition?: MaintainVisibleContentPosition
  /**
   * Accepted and unused, because it no longer describes a choice: rows
   * outside the window are not mounted at all.
   */
  removeClippedSubviews?: boolean
  /**
   * Accepted for source compatibility and needed by nothing here.
   *
   * React Native carries it because `VirtualizedList` memoises cells and
   * has to be told when a closure went stale. Nothing memoises here, so any
   * prop change already re-renders the rows -- including this one.
   */
  extraData?: unknown
}

export interface HozoFlatListHandle extends HTMLDivElement {
  scrollToOffset(options: { offset: number; animated?: boolean }): void
  scrollToEnd(options?: { animated?: boolean }): void
  scrollToIndex(options: { index: number; animated?: boolean; viewOffset?: number }): void
}

const separators = { highlight() {}, unhighlight() {}, updateProps() {} }

/** The mirror `inverted` applies, in React Native's own spelling. */
function invertedTransform(horizontal: boolean | undefined) {
  return horizontal ? [{ scaleX: -1 }] : [{ scaleY: -1 }]
}

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
    inverted,
    contentContainerStyle,
    style,
    onEndReached,
    // React Native's default, read from `VirtualizedListProps`. This file
    // used to default it to 0, which asks for the callback only once the
    // very last pixel is on screen.
    onEndReachedThreshold = 2,
    initialNumToRender = 10,
    windowSize = 21,
    maxToRenderPerBatch = 10,
    getItemLayout,
    estimatedItemSize = 100,
    maintainVisibleContentPosition,
    removeClippedSubviews: _removeClippedSubviews,
    extraData: _extraData,
    ...scrollProps
  } = props

  const items = data ?? []
  const columns = Math.max(1, Math.floor(numColumns))

  // Rows, not items, are what gets windowed. A two-column grid scrolls by
  // rows, so a window measured in items would mount half a row at each
  // edge and measure heights that no row has.
  const rows = useMemo(() => {
    const grouped: { key: string; start: number; items: T[] }[] = []
    for (let start = 0; start < items.length; start += columns) {
      const slice = items.slice(start, start + columns)
      const first = slice[0] as T
      grouped.push({ key: keyExtractor?.(first, start) ?? String(start), start, items: slice })
    }
    return grouped
    // `items` by identity: a caller handing a fresh array of the same data
    // every render is ordinary React, and regrouping is cheap next to
    // rendering.
  }, [items, columns, keyExtractor])

  const rowKeys = useMemo(() => rows.map((row) => row.key), [rows])

  const metricsRef = useRef<ListMetrics>(undefined as unknown as ListMetrics)
  if (metricsRef.current === undefined) metricsRef.current = new ListMetrics(estimatedItemSize)
  const metrics = metricsRef.current
  metrics.setEstimate(estimatedItemSize)
  metrics.setKeys(rowKeys)

  // Exact geometry replaces measurement entirely when the caller has it and
  // there is one item per row -- the case `getItemLayout` was written for.
  const exact = getItemLayout && columns === 1 ? getItemLayout : undefined
  const geometry = useMemo(
    () =>
      exact
        ? {
            offsetAt: (index: number) =>
              index <= 0
                ? 0
                : index >= rows.length
                  ? exact(data, rows.length - 1).offset + exact(data, rows.length - 1).length
                  : exact(data, index).offset,
            lengthAt: (index: number) => exact(data, Math.min(index, rows.length - 1)).length,
          }
        : metrics,
    [exact, data, rows.length, metrics],
  )

  const rootRef = useRef<HozoFlatListHandle | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const [range, setRange] = useState(() => initialRange(rows.length, initialNumToRender))
  const rangeRef = useRef(range)
  rangeRef.current = range
  const scrollRef = useRef({ offset: 0, velocity: 0, time: 0 })
  const emitRef = useRef(0)

  /**
   * Rows kept mounted around wherever focus is, on top of the scroll window.
   *
   * Two things break without it. Focus lands on a row, the reader scrolls,
   * that row leaves the window, React unmounts it -- and focus falls back to
   * `<body>`, which loses their place entirely. And tabbing forward through
   * a long list walks to the last mounted row and finds nothing after it,
   * because there is nothing after it in the document.
   *
   * `FOCUS_MARGIN` rows either side, so stepping past the edge has somewhere
   * to go before the next recompute catches up.
   */
  const focusRowRef = useRef<number | null>(null)

  /** Recomputes the window from wherever the scroller and focus currently are. */
  const recompute = useCallback(() => {
    const root = rootRef.current
    if (!root) return
    const visibleLength = horizontal ? root.clientWidth : root.clientHeight
    // Before the first layout the viewport is zero and every window is
    // empty, which would unmount the rows the first render put there.
    if (visibleLength === 0) return
    const scrolled = windowRange({
      count: rows.length,
      offset: horizontal ? root.scrollLeft : root.scrollTop,
      visibleLength,
      windowSize,
      maxToRenderPerBatch,
      velocity: scrollRef.current.velocity,
      previous: rangeRef.current,
      metrics: geometry,
    })
    const next = withFocus(scrolled, focusRowRef.current, rows.length)
    if (next.first === rangeRef.current.first && next.last === rangeRef.current.last) return
    rangeRef.current = next
    setRange(next)
  }, [geometry, horizontal, maxToRenderPerBatch, rows.length, windowSize])

  /**
   * Recomputes now, rather than on the next frame.
   *
   * This went through `requestAnimationFrame` first, which is the usual
   * advice and was wrong here twice over. It is unnecessary -- the work is
   * two binary searches and a prefix sum that only rebuilds when something
   * was measured -- and it is unreliable: a frame callback is tied to the
   * compositor producing frames, and in headless Chrome under a virtual
   * time budget it simply never ran. The window stayed on row 0 through a
   * 200,000px scroll, and `scripts/check-list.mjs` is what said so.
   */
  const scheduleRecompute = recompute
  // A row that mounted is a row that can be measured, and one pass of that
  // usually changes the window -- so the window is recomputed after every
  // commit rather than only on scroll.
  useEffect(() => {
    recompute()
  })

  useEffect(() => {
    const root = rootRef.current
    if (!root || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => recompute())
    observer.observe(root)
    return () => observer.disconnect()
  }, [recompute])

  // Where focus is, as a row index. `focusin` and `focusout` bubble, so one
  // pair of listeners on the scroller covers every row in it -- including
  // the ones mounted after this ran.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const rowOf = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return null
      const row = target.closest<HTMLElement>('[data-hozo-list-row]')
      if (!row || !root.contains(row)) return null
      const index = Number(row.dataset.hozoListRow)
      return Number.isFinite(index) ? index : null
    }
    const onFocusIn = (event: FocusEvent) => {
      const row = rowOf(event.target)
      if (row === focusRowRef.current) return
      focusRowRef.current = row
      recompute()
    }
    const onFocusOut = (event: FocusEvent) => {
      // Only when focus left the list entirely. Moving between two rows
      // fires this for the one being left, and forgetting the row there
      // would unmount the row focus is arriving at.
      if (rowOf(event.relatedTarget) !== null) return
      if (focusRowRef.current === null) return
      focusRowRef.current = null
      recompute()
    }
    root.addEventListener('focusin', onFocusIn)
    root.addEventListener('focusout', onFocusOut)
    return () => {
      root.removeEventListener('focusin', onFocusIn)
      root.removeEventListener('focusout', onFocusOut)
    }
  }, [recompute])

  /**
   * Records what a mounted row measured.
   *
   * A `ref` callback plus one shared `ResizeObserver` rather than an
   * observer per row: a window is up to twenty viewports of rows, and an
   * observer each is twenty viewports of observers.
   *
   * The row leaving the window has to stop being observed, and that is not
   * a tidiness point. A `ResizeObserver` keeps reporting an element after
   * React removes it from the document, and a removed element measures
   * zero by zero -- so every row that scrolled out of the window wrote a
   * height of 0 into the store, the mean of the measured rows fell towards
   * nothing, and ten thousand rows came to a scrollable length of 7,138px.
   * The list then had eleven rows in it and the scroll position was
   * meaningless. `scripts/check-list.mjs` is what found that; nothing
   * without layout could have.
   */
  // The observer is created once and outlives the render that made it, so
  // what its callback calls has to be read at call time rather than closed
  // over. Captured directly, it would still be holding the first render's
  // `rowKeys` and `geometry` after a data change -- and then correcting a
  // scroll position against a list that no longer exists.
  const latestRef = useRef({ recompute: () => {}, applyPin: () => {} })
  const observerRef = useRef<ResizeObserver | null>(null)
  const observedRef = useRef(new Map<Element, string>())
  const elementsRef = useRef(new Map<string, Element>())
  const measure = useCallback(
    (element: HTMLDivElement | null, key: string) => {
      if (typeof ResizeObserver === 'undefined') return
      const observed = observedRef.current
      const elements = elementsRef.current
      const previous = elements.get(key)
      if (previous && previous !== element) {
        observerRef.current?.unobserve(previous)
        observed.delete(previous)
        elements.delete(key)
      }
      if (!element) return
      if (!observerRef.current) {
        observerRef.current = new ResizeObserver((entries) => {
          let changed = false
          for (const entry of entries) {
            const entryKey = observedRef.current.get(entry.target)
            if (entryKey === undefined) continue
            // The second half of the same defence: an entry can be queued
            // for an element that has since left the document, and its box
            // is zero.
            if (!entry.target.isConnected) continue
            const box = entry.target.getBoundingClientRect()
            if (metrics.measure(entryKey, horizontal ? box.width : box.height)) changed = true
          }
          if (!changed) return
          latestRef.current.recompute()
          latestRef.current.applyPin()
        })
      }
      observed.set(element, key)
      elements.set(key, element)
      observerRef.current.observe(element)
    },
    [horizontal, metrics],
  )

  useEffect(
    () => () => {
      observerRef.current?.disconnect()
      observerRef.current = null
      observedRef.current.clear()
      elementsRef.current.clear()
    },
    [],
  )

  // Keeping one row where it is meant to be, for as long as that keeps
  // moving.
  //
  // Two features need the same thing. `maintainVisibleContentPosition` has
  // to hold the reader's row still while rows are inserted above it, and
  // `scrollToIndex` has to put a named row at the top of the viewport. Both
  // start from a scroll offset computed out of *estimated* row heights,
  // because the rows in question have not been near the viewport and
  // nothing has measured them -- so both are right to within an estimate
  // and wrong by the difference. Measured on device-sized data: a jump to
  // row 5,000 landed 1,603px off, and ten prepended rows moved the reader
  // by 12px.
  //
  // So neither of them is a single correction. A pin says which row belongs
  // at which offset from the top of the viewport, and it is re-applied on
  // every commit -- which is every time the window moves or a row reports
  // its size -- until the answer stops changing or the budget runs out.
  //
  // It yields to the reader: if the scroll position is not where the pin
  // last put it, somebody scrolled, and a list that scrolled itself back
  // would be worse than one that landed 1,603px out.
  interface Pin {
    key: string
    /** Where the row should sit, measured from the start of the viewport. */
    screenOffset: number
    /** What this last set the scroll offset to, so a reader's scroll is visible. */
    applied: number
    /** Corrections left to spend. */
    left: number
    /** When to give up, whatever has or has not settled. */
    until: number
  }
  const pinRef = useRef<Pin | null>(null)
  const anchorRef = useRef<Anchor | undefined>(undefined)
  const previousKeysRef = useRef<readonly string[]>(rowKeys)

  const pinTo = useCallback((key: string, screenOffset: number) => {
    pinRef.current = {
      key,
      screenOffset,
      applied: Number.NaN,
      left: 20,
      // A wall clock as well as a budget. A pin that waits for a
      // measurement that never comes -- a row removed while off screen, a
      // list nobody is looking at -- would otherwise sit there and move the
      // page much later, on a change it has nothing to do with.
      until: Date.now() + 2000,
    }
  }, [])

  /**
   * Puts the pinned row back where it belongs, if it has moved.
   *
   * Called after every commit *and* from the measurement callback, and the
   * second is the one that matters. A pin's first target is computed from
   * estimated row heights, so it is right to within an estimate; the real
   * answer only arrives when the rows near it report their sizes, and that
   * does not always change the window, so it does not always cause a
   * commit. Waiting for one left `scrollToIndex(5000)` sitting 1,204px
   * short.
   *
   * Silent when it is already right, rather than releasing: being in the
   * right place according to an estimate is exactly the state this exists
   * to correct.
   */
  const applyPin = useCallback(() => {
    const root = rootRef.current
    const pin = pinRef.current
    if (!root || !pin) return
    const offset = horizontal ? root.scrollLeft : root.scrollTop
    if (!Number.isNaN(pin.applied) && Math.abs(offset - pin.applied) > 1) {
      // The reader moved. The pin is theirs to override, and a list that
      // scrolled itself back would be worse than one that landed short.
      pinRef.current = null
      return
    }
    const index = rowKeys.indexOf(pin.key)
    if (index === -1 || pin.left <= 0 || Date.now() > pin.until) {
      pinRef.current = null
      return
    }
    const target = Math.max(0, geometry.offsetAt(index) - pin.screenOffset)
    if (Math.abs(target - offset) < 1) return
    pin.left -= 1
    root.scrollTo({ [horizontal ? 'left' : 'top']: target })
    pin.applied = horizontal ? root.scrollLeft : root.scrollTop
  }, [geometry, horizontal, rowKeys])

  latestRef.current = { recompute, applyPin }

  // `maintainVisibleContentPosition`: the row the reader is looking at
  // stays where it is when rows arrive above it. Anchored by key rather
  // than by index, because a feed that prepends renumbers every index and
  // no arithmetic on indices survives that.
  //
  // Ordered before the effect that applies a pin, and that is not a
  // preference. A pin left over from a `scrollToIndex` would otherwise
  // correct first, against the new list -- moving the scroll by the height
  // of what was inserted -- and this effect would then read the corrected
  // offset as though it were where the reader had been, and pin the anchor
  // that far out. Measured: the reader's row moved 996px, which is what ten
  // inserted rows are worth.
  useLayoutEffect(() => {
    const root = rootRef.current
    const previousKeys = previousKeysRef.current
    previousKeysRef.current = rowKeys
    if (!root || previousKeys === rowKeys) return

    // Whatever was being held in place was being held in a list that no
    // longer exists.
    pinRef.current = null

    if (!maintainVisibleContentPosition || previousKeys.length === 0) return
    const anchor = anchorRef.current
    if (!anchor) return
    const offset = horizontal ? root.scrollLeft : root.scrollTop
    const threshold = maintainVisibleContentPosition.autoscrollToTopThreshold
    if (threshold !== undefined && offset <= threshold) {
      root.scrollTo({ [horizontal ? 'left' : 'top']: 0 })
      return
    }
    if (rowKeys.indexOf(anchor.key) === -1) return
    pinTo(anchor.key, anchor.offset - offset)
  }, [rowKeys, maintainVisibleContentPosition, horizontal, pinTo])

  useLayoutEffect(applyPin)

  /**
   * Where the reader is, as a row and its offset.
   *
   * Recorded after every commit *and* on every scroll. A commit alone is
   * not enough: a list can be scrolled a long way with nothing re-rendering
   * once the window covers where it went, and an anchor left over from
   * before that describes somebody who has moved on. Measured -- gating
   * this on "no pin is active" left a stale anchor from before a
   * `scrollToIndex`, and the next prepend moved the reader 1,329px.
   */
  const recordAnchor = useCallback(() => {
    const root = rootRef.current
    if (!root || !maintainVisibleContentPosition) return
    anchorRef.current = anchorRow(
      rowKeys,
      geometry,
      horizontal ? root.scrollLeft : root.scrollTop,
      maintainVisibleContentPosition.minIndexForVisible,
    )
  }, [geometry, horizontal, maintainVisibleContentPosition, rowKeys])
  useEffect(recordAnchor)

  const setRoot = useCallback(
    (element: HTMLDivElement | null) => {
      if (!element) {
        rootRef.current = null
        assignRef(forwardedRef, null)
        return
      }
      const handle = element as HozoFlatListHandle
      const axis = horizontal ? ('left' as const) : ('top' as const)
      handle.scrollToOffset = ({ offset, animated }) =>
        handle.scrollTo({ [axis]: offset, behavior: animated ? 'smooth' : 'auto' })
      handle.scrollToEnd = ({ animated } = {}) =>
        handle.scrollTo({
          [axis]: horizontal ? handle.scrollWidth : handle.scrollHeight,
          behavior: animated ? 'smooth' : 'auto',
        })
      handle.scrollToIndex = ({ index, animated, viewOffset = 0 }) => {
        // React Native throws here when the target has not been measured
        // and there is no `getItemLayout`. This scrolls to the estimate
        // instead and pins the row until the rows that land there report
        // their real sizes -- the reader sees one settle rather than an
        // exception. Measured: the first version of this stopped after
        // five timeouts, all of which ran before any measurement did, and
        // left row 5,000 sitting 1,603px below the top of the viewport.
        const row = Math.floor(Math.max(0, Math.min(index, items.length - 1)) / columns)
        handle.scrollTo({
          [axis]: Math.max(0, geometry.offsetAt(row) - viewOffset),
          behavior: animated ? 'smooth' : 'auto',
        })
        const key = rowKeys[row]
        if (key !== undefined) pinTo(key, viewOffset)
      }
      rootRef.current = handle
      assignRef(forwardedRef, handle)
    },
    [columns, forwardedRef, geometry, horizontal, items.length, pinTo, rowKeys],
  )

  // `range.last` is in the dependencies and not read in the body, on
  // purpose. The sentinel sits after the *rendered* window rather than after
  // the data, so it is a different element every time the window moves, and
  // an observer left on the old one is watching a node that is gone.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    const root = rootRef.current
    const target = endRef.current
    if (!root || !target || !onEndReached || rows.length === 0) return
    if (typeof IntersectionObserver === 'undefined') return
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
    // The sentinel sits after the *rendered* window rather than after the
    // data, so it moves as the window does. Re-observed on every window
    // change for that reason, and re-armed on a data change so a feed that
    // paginates can reach the end more than once.
  }, [rows.length, range.last, horizontal, onEndReached, onEndReachedThreshold])

  const first = Math.max(0, range.first)
  const last = Math.min(rows.length - 1, range.last)
  const leading = rows.length === 0 ? 0 : geometry.offsetAt(first)
  const total = rows.length === 0 ? 0 : geometry.offsetAt(rows.length)
  const trailing = rows.length === 0 ? 0 : Math.max(0, total - geometry.offsetAt(last + 1))

  const mounted: ReactNode[] = []
  for (let index = first; index <= last; index++) {
    const row = rows[index]
    if (!row) continue
    const cells = row.items.map((item, column) =>
      createElement(
        'div',
        {
          key: keyExtractor?.(item, row.start + column) ?? row.start + column,
          role: 'listitem',
          // How long the list is, and where this row is in it.
          //
          // Without these a screen reader announces what is *mounted*: a
          // ten-thousand-row feed reads as "list, 67 items", and the reader
          // has no way to know otherwise, because the other 9,933 rows are
          // not in the accessibility tree to be counted. They are the one
          // thing about virtualisation the Web can answer completely, and
          // `@hozo/core`'s `Tree` already does the same for its rows.
          'aria-setsize': items.length,
          'aria-posinset': row.start + column + 1,
          'data-hozo-list-index': row.start + column,
        },
        renderItem({ item, index: row.start + column, separators }),
      ),
    )
    mounted.push(
      createElement(
        'div',
        {
          key: row.key,
          ref: (element: HTMLDivElement | null) => measure(element, row.key),
          // Out of the accessibility tree, so the `listitem`s inside it are
          // owned by the `list` above it. ARIA requires that relationship,
          // and this wrapper -- which exists to be measured, and to be the
          // grid row when there is more than one column -- broke it the
          // moment windowing introduced it.
          role: 'presentation',
          'data-hozo-list-row': index,
          style: {
            ...(columns > 1
              ? {
                  display: 'grid',
                  gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                }
              : undefined),
            ...(inverted ? hozoDomStyle({ transform: invertedTransform(horizontal) }) : undefined),
          },
        },
        cells,
        // Inside the row rather than beside it, so a row's measured size is
        // the space it actually occupies and the window arithmetic has one
        // kind of thing to reason about.
        index < rows.length - 1 && ItemSeparatorComponent
          ? createElement(
              'div',
              { key: 'separator', role: 'presentation' },
              renderSlot(ItemSeparatorComponent),
            )
          : null,
      ),
    )
  }

  // The rows that are not mounted, as space rather than as elements. Padding
  // on the container rather than spacer siblings: the container may be a
  // grid or a flex row, and a spacer would take a cell in one and a column
  // in the other.
  const padStart = horizontal ? 'paddingLeft' : 'paddingTop'
  const padEnd = horizontal ? 'paddingRight' : 'paddingBottom'

  const slotStyle = inverted
    ? hozoDomStyle({ transform: invertedTransform(horizontal) })
    : undefined
  const slot = (node: ReactNode) =>
    node == null || !inverted ? node : createElement('div', { style: slotStyle }, node)

  return createElement(
    HozoScrollView,
    {
      ...scrollProps,
      horizontal,
      contentContainerStyle,
      style: inverted ? [style, { transform: invertedTransform(horizontal) }] : style,
      ref: setRoot,
      onScroll: (event: HozoScrollEvent) => {
        const now = Date.now()
        const offset = horizontal
          ? event.nativeEvent.contentOffset.x
          : event.nativeEvent.contentOffset.y
        const previous = scrollRef.current
        const dt = now - previous.time
        scrollRef.current = {
          offset,
          velocity: dt > 0 ? (offset - previous.offset) / dt : 0,
          time: now,
        }
        scheduleRecompute()
        recordAnchor()
        // The caller's throttle applied here rather than upstream. The
        // window has to keep up with the scroller whatever the caller
        // asked to hear about, so this listens to every event and rations
        // only what it passes on.
        const throttle = props.scrollEventThrottle ?? 0
        if (throttle <= 0 || now - emitRef.current >= throttle) {
          emitRef.current = now
          props.onScroll?.(event)
        }
      },
      scrollEventThrottle: 0,
    },
    slot(renderSlot(ListHeaderComponent)),
    rows.length === 0 ? slot(renderSlot(ListEmptyComponent)) : null,
    rows.length > 0
      ? createElement(
          'div',
          {
            role: 'list',
            'data-hozo-list-count': items.length,
            style: {
              [padStart]: leading,
              [padEnd]: trailing,
              ...(horizontal ? { display: 'flex', flexDirection: 'row' as const } : undefined),
            },
          },
          mounted,
        )
      : null,
    slot(renderSlot(ListFooterComponent)),
    createElement('div', { ref: endRef, 'aria-hidden': true }),
  )
}

export const HozoFlatList = forwardRef(HozoFlatListInner) as <T>(
  props: HozoFlatListProps<T> & { ref?: Ref<HozoFlatListHandle> },
) => ReactElement
