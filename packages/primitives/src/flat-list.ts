import { hozoDomStyle } from '@hozo/engine'
import {
  createElement,
  type ReactNode,
  type Ref,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  assignRef,
  type HozoScrollEvent,
  HozoScrollView,
  renderSlot,
  type SharedScrollableProps,
} from './scroll-view.ts'
import {
  type Anchor,
  anchorRow,
  initialRange,
  ListMetrics,
  type MaintainVisibleContentPosition,
  windowRange,
  withFocus,
} from './windowing.ts'

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

interface RowGeometry {
  offsetAt(index: number): number
  lengthAt(index: number): number
}

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

const separators = { highlight() {}, unhighlight() {}, updateProps() {} }

/** The mirror `inverted` applies, in React Native's own spelling. */
function invertedTransform(horizontal: boolean | undefined) {
  return horizontal ? [{ scaleX: -1 }] : [{ scaleY: -1 }]
}

/**
 * Tracks which row currently holds focus so rows around focus stay mounted
 * even when scrolled out of the viewport.
 *
 * Two things break without it. Focus lands on a row, the reader scrolls,
 * that row leaves the window, React unmounts it -- and focus falls back to
 * `<body>`, losing the reader's place. And tabbing forward walks to the last
 * mounted row and finds nothing after it.
 */
function useFocusRow(
  rootRef: RefObject<HozoFlatListHandle | null>,
  focusRowRef: RefObject<number | null>,
  onChange: () => void,
) {
  // `focusin` and `focusout` bubble, so one pair of listeners on the scroller
  // covers every row in it -- including the ones mounted after this ran.
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
      onChange()
    }
    const onFocusOut = (event: FocusEvent) => {
      // Only when focus left the list entirely. Moving between two rows
      // fires this for the one being left, and forgetting the row there
      // would unmount the row focus is arriving at.
      if (rowOf(event.relatedTarget) !== null) return
      if (focusRowRef.current === null) return
      focusRowRef.current = null
      onChange()
    }
    root.addEventListener('focusin', onFocusIn)
    root.addEventListener('focusout', onFocusOut)
    return () => {
      root.removeEventListener('focusin', onFocusIn)
      root.removeEventListener('focusout', onFocusOut)
    }
  }, [rootRef, focusRowRef, onChange])
}

/**
 * Keeps one row pinned at its target viewport offset while surrounding row
 * measurements settle — shared by `scrollToIndex` and
 * `maintainVisibleContentPosition`.
 *
 * Both start from estimated row heights (measured on device-sized data: a jump
 * to row 5,000 landed 1,603px off, and ten prepended rows moved the reader by
 * 12px), so the pin is re-applied on every commit and measurement until it
 * settles, yields to a reader scroll, or exhausts its budget.
 */
function useScrollPin(
  rootRef: RefObject<HozoFlatListHandle | null>,
  rowKeys: readonly string[],
  geometry: RowGeometry,
  horizontal: boolean | undefined,
  maintainVisibleContentPosition: MaintainVisibleContentPosition | undefined,
) {
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
   * second is the one that matters: real sizes arrive asynchronously and do
   * not always change the window or trigger a commit. Silent when already
   * right, rather than releasing, because agreeing with an estimate is
   * exactly the state this exists to correct.
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
  }, [geometry, horizontal, rootRef, rowKeys])

  // `maintainVisibleContentPosition`: the row the reader is looking at stays
  // where it is when rows arrive above it. Anchored by key rather than index,
  // because prepending renumbers every index.
  //
  // Ordered before the effect that applies a pin, and that is not a
  // preference. A pin left over from `scrollToIndex` would otherwise correct
  // first against the new list, and this effect would then read the shifted
  // offset as where the reader had been (measured: 996px drift on 10 rows).
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
  }, [rowKeys, maintainVisibleContentPosition, horizontal, pinTo, rootRef])

  useLayoutEffect(applyPin)

  /**
   * Where the reader is, as a row and its offset.
   *
   * Recorded after every commit *and* on every scroll. A commit alone is not
   * enough: scrolling within an already-mounted window does not re-render,
   * and gating on "no pin is active" left a stale anchor from before a
   * `scrollToIndex` (measured: 1,329px drift on the next prepend).
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
  }, [geometry, horizontal, maintainVisibleContentPosition, rootRef, rowKeys])
  useEffect(recordAnchor)

  return { pinTo, applyPin, recordAnchor }
}

/**
 * Records what mounted rows measured through one shared `ResizeObserver`.
 *
 * A row leaving the window has to stop being observed, and that is not a
 * tidiness point: a `ResizeObserver` keeps reporting a detached element as
 * 0x0, driving the measured mean toward zero (`scripts/check-list.mjs` caught
 * ten thousand rows collapsing to 7,138px).
 */
function useRowMeasurement(
  metrics: ListMetrics,
  horizontal: boolean | undefined,
  onMeasured: () => void,
) {
  // The observer outlives the render that created it, so the callback is read
  // through a ref at call time rather than closing over stale `rowKeys` or
  // `geometry` after a data change.
  const onMeasuredRef = useRef(onMeasured)
  onMeasuredRef.current = onMeasured
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
            // Second half of the detached-element defence: an entry can be
            // queued for an element that has since left the document (0x0).
            if (!entry.target.isConnected) continue
            const box = entry.target.getBoundingClientRect()
            if (metrics.measure(entryKey, horizontal ? box.width : box.height)) changed = true
          }
          if (!changed) return
          onMeasuredRef.current()
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

  return measure
}

/**
 * Watches the sentinel after the *rendered* window and notifies `onEndReached`
 * once per data/window cycle.
 */
function useEndReached(
  rootRef: RefObject<HozoFlatListHandle | null>,
  endRef: RefObject<HTMLDivElement | null>,
  {
    rowCount,
    lastRow,
    horizontal,
    onEndReached,
    threshold,
  }: {
    rowCount: number
    lastRow: number
    horizontal: boolean | undefined
    onEndReached: ((info: { distanceFromEnd: number }) => void) | undefined
    threshold: number
  },
) {
  // `lastRow` is in the dependencies and not read in the body, on purpose.
  // The sentinel sits after the *rendered* window rather than after the data,
  // so it moves as the window moves; re-observing on every window change and
  // re-arming on data changes lets a paginating feed reach the end again.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    const root = rootRef.current
    const target = endRef.current
    if (!root || !target || !onEndReached || rowCount === 0) return
    if (typeof IntersectionObserver === 'undefined') return
    let fired = false
    const margin = `${Math.max(0, threshold) * 100}%`
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
  }, [rowCount, lastRow, horizontal, onEndReached, threshold, rootRef, endRef])
}

export function HozoFlatList<T>(props: HozoFlatListProps<T> & { ref?: Ref<HozoFlatListHandle> }) {
  const {
    ref: forwardedRef,
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
  const geometry = useMemo<RowGeometry>(
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

  const focusRowRef = useRef<number | null>(null)

  /**
   * Recomputes the window synchronously from wherever the scroller and focus
   * currently are.
   *
   * Synchronous rather than via `requestAnimationFrame`: the work is two binary
   * searches and a prefix sum that only rebuilds on measurement, and in
   * headless Chrome under a virtual time budget `rAF` never ran (`check-list.mjs`).
   */
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

  useFocusRow(rootRef, focusRowRef, recompute)

  const { pinTo, applyPin, recordAnchor } = useScrollPin(
    rootRef,
    rowKeys,
    geometry,
    horizontal,
    maintainVisibleContentPosition,
  )

  const measure = useRowMeasurement(metrics, horizontal, () => {
    recompute()
    applyPin()
  })

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
        // exception.
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

  useEndReached(rootRef, endRef, {
    rowCount: rows.length,
    lastRow: range.last,
    horizontal,
    onEndReached,
    threshold: onEndReachedThreshold,
  })

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
          // How long the list is, and where this row is in it. Without these
          // a screen reader announces only what is *mounted* rather than the
          // full list length.
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
          // owned by the `list` above it.
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
        recompute()
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
