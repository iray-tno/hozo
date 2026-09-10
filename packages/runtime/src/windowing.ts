// Which rows a long list actually mounts, and where they sit.
//
// The Web `FlatList` bridge accepted `initialNumToRender`, `windowSize` and
// `removeClippedSubviews` and rendered every row anyway, so a thousand-row
// feed was a thousand mounted subtrees (#385). This is the part that
// decides otherwise, and it is here rather than in `./list.ts` because it
// is arithmetic: no DOM, no React, no browser, and therefore testable
// directly rather than through a rendered page.
//
// ## Where the design comes from
//
// Four other frameworks solve this, and they do not agree about how much
// to ask of the caller:
//
// | | sizing | window unit |
// |---|---|---|
// | React Native `VirtualizedList` | measured, `getItemLayout` overrides | `windowSize`, in viewports |
// | SwiftUI `LazyVStack`, Compose `LazyColumn` | intrinsic, no knobs at all | none exposed |
// | `react-window` | `itemSize` required from the caller | `overscanCount`, in items |
// | `react-virtuoso`, TanStack Virtual | measured automatically | overscan in px / in items |
//
// The two platform frameworks with the best reputation for this expose no
// tuning whatsoever -- the framework measures, and the only thing the
// caller supplies is a stable key. The React libraries that measure
// automatically are also the ones that handle variable heights well, and
// the one that demands sizes up front is the oldest design of the four.
//
// So: measure by default, treat React Native's knobs as bounds rather than
// as requirements, and let `getItemLayout` be the shortcut for a caller who
// already knows rather than a precondition for working at all.
//
// ## Why the arithmetic is React Native's rather than a new one
//
// `windowSize` has a meaning -- `(windowSize - 1)` viewports of overscan,
// split half before and half after -- and `react-native-web` ships React
// Native's own implementation of it, so a Web project using RNW today
// already gets exactly this. A prop that quietly meant something narrower
// here would be the same rule with two implementations, which is the shape
// of bug this repository keeps finding. `windowRange` is therefore a port
// of `computeWindowedRenderLimits` from
// `@react-native/virtualized-lists` 0.87, read from the installed package
// rather than from memory, minus the zoom scale (which the Web has no
// equivalent of on a scroll container).

/** What one row's geometry is, in the scrolling axis. */
export interface RowMetrics {
  offset: number
  length: number
}

/**
 * Row lengths, measured where they have been and estimated where they have
 * not.
 *
 * Keyed by the caller's own key rather than by index, which is the whole
 * point: a feed that prepends ten rows moves every index by ten, and a
 * store keyed by index would report ten rows of wrong heights and jump the
 * scroll position. Compose makes the same argument for `key` on
 * `LazyColumn`, and it is the one thing SwiftUI and Compose *do* ask of a
 * caller.
 */
export class ListMetrics {
  /** Measured lengths, by key, surviving reorder and window movement. */
  private readonly measured = new Map<string, number>()
  /** Prefix sums for the current key order; rebuilt when something changes. */
  private offsets: number[] = []
  private keys: readonly string[] = []
  private dirty = true
  // A plain field rather than a parameter property: Node strips types
  // rather than compiling them, and a parameter property is the one piece
  // of TypeScript that emits code.
  private estimate: number

  constructor(estimate: number) {
    this.estimate = estimate
  }

  /** The key order to measure against. Cheap to call every render. */
  setKeys(keys: readonly string[]): void {
    if (keys.length === this.keys.length && keys.every((key, i) => key === this.keys[i])) return
    this.keys = keys
    this.dirty = true
  }

  /**
   * Records what a row actually measured.
   *
   * Returns whether this changed anything, so a caller can avoid a re-render
   * for a `ResizeObserver` callback that reports the size it already knew --
   * which is most of them, since the observer fires on mount for every row.
   */
  measure(key: string, length: number): boolean {
    if (this.measured.get(key) === length) return false
    this.measured.set(key, length)
    this.dirty = true
    return true
  }

  /** Forgets a measurement. For a row whose content changed identity under one key. */
  forget(key: string): void {
    if (this.measured.delete(key)) this.dirty = true
  }

  /**
   * The estimate used for rows nothing has measured.
   *
   * The mean of what *has* been measured, once anything has, rather than
   * the constructor's number. A list of 60px rows told to estimate 100
   * would otherwise keep a scrollbar half again too long for as long as it
   * was scrolled, and every `scrollToIndex` past the window would land in
   * the wrong place. React Native keeps the same running average for the
   * same reason.
   */
  get averageLength(): number {
    if (this.measured.size === 0) return this.estimate
    let total = 0
    for (const length of this.measured.values()) total += length
    return total / this.measured.size
  }

  /** Replaces the starting estimate. For a caller that learns a better one. */
  setEstimate(estimate: number): void {
    if (estimate === this.estimate) return
    this.estimate = estimate
    this.dirty = true
  }

  lengthAt(index: number): number {
    const key = this.keys[index]
    if (key === undefined) return this.averageLength
    return this.measured.get(key) ?? this.averageLength
  }

  offsetAt(index: number): number {
    this.rebuild()
    if (index <= 0) return 0
    if (index >= this.offsets.length) return this.totalLength
    return this.offsets[index] as number
  }

  metricsAt(index: number): RowMetrics {
    return { offset: this.offsetAt(index), length: this.lengthAt(index) }
  }

  get totalLength(): number {
    this.rebuild()
    return this.offsets.length === 0 ? 0 : (this.offsets[this.offsets.length - 1] as number)
  }

  /** How many of the current rows have a real measurement. */
  get measuredCount(): number {
    let count = 0
    for (const key of this.keys) if (this.measured.has(key)) count += 1
    return count
  }

  private rebuild(): void {
    if (!this.dirty) return
    this.dirty = false
    const average = this.averageLength
    // One more entry than there are rows: the last is the total, which is
    // also the offset a row appended next would take.
    this.offsets = new Array(this.keys.length + 1)
    let running = 0
    for (let index = 0; index < this.keys.length; index++) {
      this.offsets[index] = running
      running += this.measured.get(this.keys[index] as string) ?? average
    }
    this.offsets[this.keys.length] = running
  }
}

/** The rows to mount, inclusive at both ends. `last < first` means none. */
export interface WindowRange {
  first: number
  last: number
}

export interface WindowRangeInput {
  count: number
  /** Scroll offset along the axis, in list space. */
  offset: number
  /** The viewport's length along the axis. */
  visibleLength: number
  /** React Native's units: `(windowSize - 1)` viewports of overscan. */
  windowSize: number
  maxToRenderPerBatch: number
  /** Signed, for the fill bias. Zero is the honest answer when unknown. */
  velocity?: number
  previous: WindowRange
  metrics: Pick<ListMetrics, 'offsetAt' | 'lengthAt'>
}

/**
 * The first and last row indices to mount.
 *
 * A port of `computeWindowedRenderLimits`; see this file's header for why
 * it is a port rather than an invention.
 */
export function windowRange(input: WindowRangeInput): WindowRange {
  const { count, visibleLength, windowSize, maxToRenderPerBatch, previous, metrics } = input
  if (count === 0) return { first: 0, last: -1 }

  const velocity = input.velocity ?? 0
  const visibleBegin = Math.max(0, input.offset)
  const visibleEnd = visibleBegin + visibleLength
  const overscanLength = (windowSize - 1) * visibleLength

  // React Native's own comment says considering velocity here introduced
  // more churn than it was worth, and its `leadFactor` is the constant that
  // remains. The bias survives only in `fillPreference`.
  const leadFactor = 0.5
  const fillPreference = velocity > 1 ? 'after' : velocity < -1 ? 'before' : 'none'

  const overscanBegin = Math.max(0, visibleBegin - (1 - leadFactor) * overscanLength)
  const overscanEnd = Math.max(0, visibleEnd + leadFactor * overscanLength)

  if (metrics.offsetAt(count - 1) < overscanBegin) {
    // The whole list is above the window: scrolled past the end, which
    // happens while data shrinks under a stationary scroll position.
    return { first: Math.max(0, count - 1 - maxToRenderPerBatch), last: count - 1 }
  }

  const found = rowsAtOffsets(
    [overscanBegin, visibleBegin, visibleEnd, overscanEnd],
    count,
    metrics,
  )
  const overscanFirst = found[0] ?? 0
  let first = found[1] ?? Math.max(0, overscanFirst)
  const overscanLast = found[3] ?? count - 1
  let last = found[2] ?? Math.min(overscanLast, first + maxToRenderPerBatch - 1)
  const visible = { first, last }

  // Grown a batch at a time rather than filled at once: the overscan window
  // is up to twenty viewports of content, and rendering all of it in one
  // commit is a long pause staring at whatever is already on screen.
  let newCells = newRangeCount(previous, visible)
  for (;;) {
    if (first <= overscanFirst && last >= overscanLast) break
    const atMax = newCells >= maxToRenderPerBatch
    const firstWillAddMore = first <= previous.first
    const lastWillAddMore = last >= previous.last
    const firstShouldIncrement = first > overscanFirst && (!atMax || !firstWillAddMore)
    const lastShouldIncrement = last < overscanLast && (!atMax || !lastWillAddMore)
    // Stop only when the batch is full *and* neither end can grow without
    // adding a new cell -- so rows already mounted stay mounted and the
    // window keeps as much of itself as it can.
    if (atMax && !firstShouldIncrement && !lastShouldIncrement) break
    if (
      firstShouldIncrement &&
      !(fillPreference === 'after' && lastShouldIncrement && lastWillAddMore)
    ) {
      if (firstWillAddMore) newCells += 1
      first -= 1
    }
    if (
      lastShouldIncrement &&
      !(fillPreference === 'before' && firstShouldIncrement && firstWillAddMore)
    ) {
      if (lastWillAddMore) newCells += 1
      last += 1
    }
  }

  return { first, last }
}

/** How many rows `next` mounts that `previous` did not. */
function newRangeCount(previous: WindowRange, next: WindowRange): number {
  return (
    next.last -
    next.first +
    1 -
    Math.max(0, 1 + Math.min(next.last, previous.last) - Math.max(next.first, previous.first))
  )
}

/**
 * The row containing each offset, or `undefined` past the ends.
 *
 * Binary search rather than a scan, because it runs on every scroll event
 * and the list it searches is the reason this file exists.
 *
 * Bounds are React Native's, and they are asymmetric: a row owns its end
 * offset but not its start, except for the first row, which owns both. So
 * an offset exactly on a boundary resolves to the *earlier* of the two
 * rows -- which is why an overscan edge that lands on a boundary pulls in
 * the row above it.
 */
function rowsAtOffsets(
  offsets: readonly number[],
  count: number,
  metrics: Pick<ListMetrics, 'offsetAt' | 'lengthAt'>,
): (number | undefined)[] {
  return offsets.map((offset) => {
    let left = 0
    let right = count - 1
    while (left <= right) {
      const mid = left + Math.floor((right - left) / 2)
      const start = metrics.offsetAt(mid)
      const end = start + metrics.lengthAt(mid)
      if ((mid === 0 && offset < start) || (mid !== 0 && offset <= start)) right = mid - 1
      else if (offset > end) left = mid + 1
      else return mid
    }
    return undefined
  })
}

/**
 * The first `count` rows, for the render before anything has been measured.
 *
 * `initialNumToRender` is not an overscan window and is not derived from
 * one: it is what to put on the screen when the viewport's own size is not
 * known yet, which on the Web is every server render and the first client
 * commit. Rendering nothing there would hand a crawler and a
 * `renderToStaticMarkup` caller an empty list.
 */
export function initialRange(count: number, initialNumToRender: number): WindowRange {
  if (count === 0) return { first: 0, last: -1 }
  return { first: 0, last: Math.min(count, Math.max(1, initialNumToRender)) - 1 }
}

/** A row to hold still across a data change, and where it was. */
export interface Anchor {
  key: string
  offset: number
}

export interface MaintainVisibleContentPosition {
  /**
   * The first row allowed to be the anchor.
   *
   * `1` is the usual value for a feed with a header row: the header is
   * index 0 and is always at offset 0, so anchoring on it would hold
   * nothing still.
   */
  minIndexForVisible: number
  /**
   * Scroll to the top instead of holding position, when already within this
   * many pixels of it. Absent means never.
   */
  autoscrollToTopThreshold?: number
}

/**
 * The row to hold still when the data changes under a scrolled list.
 *
 * The first row at or after `minIndexForVisible` whose end is below the
 * current offset -- that is, the first one the reader can see. Holding a
 * row by *key* rather than by index is what makes this work at all: a feed
 * that prepends ten rows renumbers every index, and there is no arithmetic
 * on indices that survives it.
 */
export function anchorRow(
  keys: readonly string[],
  metrics: Pick<ListMetrics, 'offsetAt' | 'lengthAt'>,
  scrollOffset: number,
  minIndexForVisible: number,
): Anchor | undefined {
  for (let index = Math.max(0, minIndexForVisible); index < keys.length; index++) {
    const offset = metrics.offsetAt(index)
    if (offset + metrics.lengthAt(index) > scrollOffset) {
      return { key: keys[index] as string, offset }
    }
  }
  return undefined
}

/**
 * How far the scroll offset has to move for `anchor` to stay where it was.
 *
 * Zero when the anchor is gone -- deleted, or scrolled out of a list that
 * was replaced wholesale -- because the honest answer there is that there
 * is nothing left to hold still, and inventing a correction would move a
 * list the reader was looking at.
 */
export function anchorCorrection(
  anchor: Anchor,
  keys: readonly string[],
  metrics: Pick<ListMetrics, 'offsetAt'>,
): number {
  const index = keys.indexOf(anchor.key)
  if (index === -1) return 0
  return metrics.offsetAt(index) - anchor.offset
}
