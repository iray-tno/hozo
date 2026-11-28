// The brush: a strip under a long chart that picks which run of its rows
// the chart shows. Pure, so both boxes and the chart agree on where a key or
// a drag leaves the range, and on what the summary says is shown.

import { linearScale } from './scale.ts'

/** The first and last row shown, both included, in data order. */
export interface BrushRange {
  start: number
  end: number
}

/** `range` inside `[0, count - 1]`, with start never after end; the whole when absent. */
export function clampRange(range: Partial<BrushRange> | undefined, count: number): BrushRange {
  const last = Math.max(0, count - 1)
  const fit = (value: number | undefined, fallback: number) =>
    value === undefined || !Number.isFinite(value)
      ? fallback
      : Math.min(last, Math.max(0, Math.round(value)))
  const start = fit(range?.start, 0)
  const end = fit(range?.end, last)
  return start <= end ? { start, end } : { start: end, end: start }
}

/**
 * Where a key moves one end of the range: a row with the arrows, a tenth of
 * the rows with Page Up and Page Down, all the way with Home and End. An end
 * stops at the other, so the range is never empty; undefined for a key the
 * brush does not use.
 */
export function moveEnd(
  key: string,
  range: BrushRange,
  which: 'start' | 'end',
  count: number,
): BrushRange | undefined {
  const page = Math.max(1, Math.round(count / 10))
  const at = range[which]
  let next: number
  switch (key) {
    case 'ArrowRight':
    case 'ArrowUp':
      next = at + 1
      break
    case 'ArrowLeft':
    case 'ArrowDown':
      next = at - 1
      break
    case 'PageUp':
      next = at + page
      break
    case 'PageDown':
      next = at - page
      break
    case 'Home':
      next = 0
      break
    case 'End':
      next = count - 1
      break
    default:
      return undefined
  }
  const low = which === 'start' ? 0 : range.start
  const high = which === 'start' ? range.end : count - 1
  return { ...range, [which]: Math.min(high, Math.max(low, next)) }
}

export interface BrushModel {
  width: number
  height: number
  /** The whole of the first series as a line, so the reader sees where to look. */
  overview: string
  /** The shown range's left and right edges. */
  x0: number
  x1: number
  /** The row under `x`, clamped to the data. */
  indexAt(x: number): number
  /** The width of one row. */
  cell: number
}

const round = (value: number) => Math.round(value * 100) / 100

/**
 * The strip at `width`: one cell per row, the overview through the cells'
 * middles with a break at each gap, and the range from the left of its
 * first cell to the right of its last.
 */
export function brushModel(
  values: readonly (number | undefined)[],
  range: BrushRange,
  width: number,
  height: number,
): BrushModel {
  const count = values.length
  const cell = count > 0 ? width / count : width
  let low = Number.POSITIVE_INFINITY
  let high = Number.NEGATIVE_INFINITY
  for (const value of values)
    if (value !== undefined) {
      low = Math.min(low, value)
      high = Math.max(high, value)
    }
  const inset = Math.min(4, height / 4)
  const y = Number.isFinite(low)
    ? linearScale(low === high ? [low - 1, high + 1] : [low, high], [height - inset, inset])
    : () => height / 2
  let overview = ''
  let open = false
  values.forEach((value, i) => {
    if (value === undefined) {
      open = false
      return
    }
    overview += `${open ? 'L' : 'M'}${round((i + 0.5) * cell)},${round(y(value))}`
    open = true
  })
  return {
    width,
    height,
    overview,
    x0: round(range.start * cell),
    x1: round((range.end + 1) * cell),
    cell,
    indexAt: (x) => Math.min(count - 1, Math.max(0, Math.floor(x / cell))),
  }
}

/** What a press on the strip took hold of. */
export type BrushGrab =
  | { kind: 'start' }
  | { kind: 'end' }
  /** The whole range, held `offset` rows from its start. */
  | { kind: 'window'; offset: number }

/**
 * What a press at `x` holds: an end when it lands within `reach` of one,
 * the range when inside it, and otherwise the nearer end, which jumps to
 * the press.
 */
export function grabAt(model: BrushModel, range: BrushRange, x: number, reach = 12): BrushGrab {
  const toStart = Math.abs(x - model.x0)
  const toEnd = Math.abs(x - model.x1)
  if (Math.min(toStart, toEnd) <= reach) return { kind: toStart < toEnd ? 'start' : 'end' }
  if (x > model.x0 && x < model.x1)
    return { kind: 'window', offset: model.indexAt(x) - range.start }
  return { kind: x <= model.x0 ? 'start' : 'end' }
}

/** The range after dragging `grab` to `x`; an end stops at the other, the range keeps its length. */
export function dragTo(
  model: BrushModel,
  range: BrushRange,
  grab: BrushGrab,
  x: number,
  count: number,
): BrushRange {
  const at = model.indexAt(x)
  switch (grab.kind) {
    case 'start':
      return { ...range, start: Math.min(range.end, at) }
    case 'end':
      return { ...range, end: Math.max(range.start, at) }
    case 'window': {
      const length = range.end - range.start
      const start = Math.min(count - 1 - length, Math.max(0, at - grab.offset))
      return { start, end: start + length }
    }
  }
}

/** "Showing 31 of 365 categories." Nothing when the whole is shown. */
export function rangeNote(range: BrushRange, count: number): string {
  const shown = range.end - range.start + 1
  if (shown >= count) return ''
  return `Showing ${shown.toLocaleString('en-US')} of ${count.toLocaleString('en-US')} categories.`
}
