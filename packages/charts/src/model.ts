// The chart model: data and a chart definition in, plot geometry and marks
// out (RFC 015 §4). Pure: no React, no platform, so the SVG renderer, a
// later Canvas renderer and the accessible table all read one answer.

import type { Radial } from './pie.ts'
import {
  type BandScale,
  bandScale,
  type LinearScale,
  linearScale,
  niceDomain,
  pointScale,
} from './scale.ts'

export interface ChartSeries {
  /** The field of each row that holds this series' value. */
  key: string
  /** What a reader hears and the legend shows. */
  label: string
  /**
   * This series' colour, any value the platform's SVG accepts. A runtime
   * string cannot be a class list on Native, where `className` is
   * compile-time input; the default palette applies when absent.
   */
  color?: string
}

export interface ChartXAxis {
  /** The field of each row that holds its category. */
  key: string
  label?: string
  format?: (value: unknown) => string
}

export interface ChartYAxis {
  label?: string
  format?: (value: number) => string
  /** A fixed domain; otherwise the data's, widened to round ticks. */
  domain?: readonly [number, number]
}

export interface Margin {
  top: number
  right: number
  bottom: number
  left: number
}

/**
 * A target, threshold or normal range on the value axis: a line at
 * `value`, or a band from `value` to `to`. It is part of what the chart
 * says, so the summary reads it after the series.
 */
export interface ChartReference {
  value: number
  to?: number
  label: string
}

/** A reference placed on the value axis: `start` and `end` are positions. */
export interface PlacedReference extends ChartReference {
  start: number
  end?: number
}

export interface ChartInput {
  data: readonly Record<string, unknown>[]
  x: ChartXAxis
  y?: ChartYAxis
  series: readonly ChartSeries[]
  width: number
  height: number
  /** Overrides the estimated space for the axes, side by side. */
  margin?: Partial<Margin>
  /** The tick label size the margins are estimated for. */
  fontSize?: number
  /** Lines and bands on the value axis; the domain widens to show them. */
  references?: readonly ChartReference[]
  /**
   * A key naming each series above the plot, so colour is never the only
   * way to tell them apart. Shown for two or more series unless false.
   */
  legend?: boolean
  /** How thick bars get and how far apart they stand; a theme sets it. */
  bar?: BarShape
}

export interface BarShape {
  /** The thickest a bar gets; 24 by default. */
  maxWidth?: number
  /** Between touching bars and between stacked segments; 2 by default. */
  gap?: number
}

/** One series in the key above the plot: a swatch at `x`, its label after it. */
export interface LegendKey {
  series: number
  label: string
  x: number
  /** The top of the key's row. */
  y: number
}

export interface BarChartInput extends ChartInput {
  stacked?: boolean
  /**
   * Bars run left to right, categories top to bottom: the layout for long
   * labels and rankings. `y` still describes the values, now along x.
   */
  horizontal?: boolean
}

/** A series of a composed chart, drawn as bars (the default) or as a line. */
export interface ComposedSeries extends ChartSeries {
  type?: 'bar' | 'line'
}

export interface ComposedChartInput extends ChartInput {
  series: readonly ComposedSeries[]
}

export interface AreaChartInput extends ChartInput {
  /** Each series' band sits on the ones before it, so the top edge is the total. */
  stacked?: boolean
}

export type Mark =
  | {
      kind: 'bar'
      series: number
      datum: number
      x: number
      y: number
      width: number
      height: number
      /**
       * The edge at the bar's value, rounded off; absent on a stacked
       * segment with another on top of it, whose ends both meet a neighbour.
       */
      end?: BarEnd
    }
  | { kind: 'line'; series: number; path: string }
  /**
   * The filled band under a line, or between two in a stack; translucent
   * when the bands of an unstacked chart overlap.
   */
  | { kind: 'area'; series: number; path: string; opacity: number }
  | { kind: 'point'; series: number; datum: number; cx: number; cy: number }
  /**
   * A pie or donut slice; `cx`/`cy` is the middle of its ring, and `tone`
   * its index into the palette, which is by slice rather than by row.
   */
  | {
      kind: 'arc'
      series: number
      datum: number
      tone: number
      path: string
      cx: number
      cy: number
    }

export interface Tick {
  position: number
  label: string
}

export interface ChartModel {
  width: number
  height: number
  plot: { x: number; y: number; width: number; height: number }
  /** One label per row, in data order. */
  categories: string[]
  /** `values[series][datum]`; `undefined` is a gap, never zero. */
  values: (number | undefined)[][]
  marks: Mark[]
  xTicks: Tick[]
  yTicks: Tick[]
  /** The x centre of each datum, for pointer and touch to find the nearest. */
  centers: number[]
  /**
   * The datum at a point in the chart: nearest in x for Bar and Line, the
   * slice or legend row under it for a pie. -1 when there is none.
   */
  datumAt(x: number, y?: number): number
  /** A pie's geometry; absent on Bar and Line. */
  radial?: Radial
  /** The series key above the plot; absent or empty for one series and for a pie. */
  legend?: LegendKey[]
  /**
   * Horizontal bars: `centers` are then y positions, `xTicks` the values
   * and `yTicks` the categories.
   */
  horizontal?: boolean
  /**
   * A scatter plot's x values, read with each point: `values` formatted in
   * datum order, and how many rows had no x and were left out.
   * `inTable` is false when the x value is already the row's name.
   */
  xColumn?: { label: string; values: string[]; missing: number; inTable: boolean }
  /** Reference lines and bands, placed on the value axis (x when `horizontal`). */
  references: PlacedReference[]
}

/** A row's value: finite, or a gap. A string or null is a gap, not zero. */
export function rowValue(row: Record<string, unknown>, key: string): number | undefined {
  const value = row[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export const defaultFormat = (value: number) => {
  // Ticks come from `ticks()`, which already avoids binary noise; this only
  // keeps a long fraction from widening the axis.
  return Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(6)))
}

function categoriesOf(input: ChartInput): string[] {
  const format = input.x.format ?? ((value: unknown) => String(value ?? ''))
  return input.data.map((row) => format(row[input.x.key]))
}

/**
 * The width a label of `text` needs at `fontSize`, without measuring it.
 * Native cannot measure text synchronously, so phase 1 estimates (RFC 015
 * §4) from an average glyph of 0.6 em, wider for CJK; `margin` overrides
 * the result when the estimate is wrong.
 */
export function estimateTextWidth(text: string, fontSize: number): number {
  let ems = 0
  for (const char of text) ems += /[ᄀ-ￜ]/u.test(char) ? 1 : 0.6
  return ems * fontSize
}

export interface Frame {
  margin: Margin
  plot: ChartModel['plot']
  y: LinearScale
  yTicks: Tick[]
  references: PlacedReference[]
  legend: LegendKey[]
}

/**
 * The series key, in rows across the top that wrap at the chart's width,
 * and the height it takes. One series needs no key: the chart's name says
 * what it plots.
 */
export function seriesLegend(input: ChartInput): { keys: LegendKey[]; height: number } {
  const fontSize = input.fontSize ?? 12
  if (input.legend === false || input.series.length < 2) return { keys: [], height: 0 }
  const gap = fontSize / 2
  const lineHeight = fontSize * 1.6
  const keys: LegendKey[] = []
  let x = gap
  let row = 0
  for (const [series, entry] of input.series.entries()) {
    const width = fontSize + gap + estimateTextWidth(entry.label, fontSize)
    if (x > gap && x + width > input.width - gap) {
      x = gap
      row++
    }
    keys.push({ series, label: entry.label, x, y: row * lineHeight })
    x += width + fontSize * 1.5
  }
  return { keys, height: (row + 1) * lineHeight + gap }
}

/**
 * The room a reference's label takes outside the plot: to the right of an
 * upright chart, so it never covers a bar or a line, or 0 with none.
 */
export function referenceRoom(
  references: readonly ChartReference[] | undefined,
  fontSize: number,
): number {
  if (!references?.length) return 0
  const widest = Math.max(...references.map((entry) => estimateTextWidth(entry.label, fontSize)))
  return Math.ceil(widest + fontSize)
}

/** The data's domain, widened so that every reference is inside it. */
function withReferences(
  domain: [number, number],
  references: readonly ChartReference[] = [],
): [number, number] {
  let [lo, hi] = domain
  for (const reference of references)
    for (const value of [reference.value, reference.to ?? reference.value])
      if (Number.isFinite(value)) {
        lo = Math.min(lo, value)
        hi = Math.max(hi, value)
      }
  return [lo, hi]
}

function placeReferences(
  references: readonly ChartReference[] = [],
  scale: LinearScale,
): PlacedReference[] {
  return references
    .filter((reference) => Number.isFinite(reference.value))
    .map((reference) => ({
      ...reference,
      start: scale(reference.value),
      ...(reference.to === undefined ? {} : { end: scale(reference.to) }),
    }))
}

/** Margins and the y scale, which depend on each other through the tick labels. */
export function frame(input: ChartInput, domain: [number, number]): Frame {
  const fontSize = input.fontSize ?? 12
  const format = input.y?.format ?? defaultFormat
  const gap = fontSize / 2
  const legend = seriesLegend(input)
  const top = input.margin?.top ?? gap + legend.height
  const bottom = input.margin?.bottom ?? fontSize + gap * 2 + (input.x.label ? fontSize + gap : 0)
  const plotHeight = Math.max(0, input.height - top - bottom)
  const count = Math.max(2, Math.floor(plotHeight / 40))
  const [lo, hi] = withReferences(domain, input.references)
  const [d0, d1] = input.y?.domain ?? niceDomain(lo, hi, count)
  const y = linearScale([d0, d1], [top + plotHeight, top])
  const tickValues = y.ticks(count)
  const labels = tickValues.map(format)
  const widest = Math.max(0, ...labels.map((label) => estimateTextWidth(label, fontSize)))
  const left =
    input.margin?.left ?? Math.ceil(widest + gap * 2 + (input.y?.label ? fontSize + gap : 0))
  const right = input.margin?.right ?? Math.max(gap * 2, referenceRoom(input.references, fontSize))
  const margin = { top, right, bottom, left }
  return {
    margin,
    plot: { x: left, y: top, width: Math.max(0, input.width - left - right), height: plotHeight },
    y,
    yTicks: tickValues.map((value, i) => ({ position: y(value), label: labels[i] as string })),
    references: placeReferences(input.references, y),
    legend: legend.keys,
  }
}

/** Every n-th category label, so that estimated labels do not overlap. */
function xTicks(categories: string[], centers: number[], step: number, fontSize: number): Tick[] {
  const widest = Math.max(0, ...categories.map((label) => estimateTextWidth(label, fontSize)))
  const every = step > 0 ? Math.max(1, Math.ceil((widest + fontSize) / step)) : 1
  const out: Tick[] = []
  for (let i = 0; i < categories.length; i += every)
    out.push({ position: centers[i] as number, label: categories[i] as string })
  return out
}

export type BarEnd = 'top' | 'bottom' | 'left' | 'right'

/**
 * The thickest a bar gets. A band wider than its bars is left as air: a few
 * categories across a wide chart read as bars, not as slabs of colour.
 */
export const BAR_MAX = 24
/** Between touching bars, and between stacked segments, so each reads as one. */
const BAR_GAP = 2

/**
 * Where each of `groups` bars sits across a band starting at `start`: as
 * thick as fits up to `shape.maxWidth`, a gap apart, and centred on the band. A band
 * too narrow for the gap drops it rather than the bars.
 */
function barSlots(start: number, bandwidth: number, groups: number, shape?: BarShape) {
  const max = shape?.maxWidth ?? BAR_MAX
  const want = shape?.gap ?? BAR_GAP
  const gap = bandwidth / groups > want * 3 ? want : 0
  const size = Math.max(0, Math.min(max, (bandwidth - gap * (groups - 1)) / groups))
  const first = start + (bandwidth - (size * groups + gap * (groups - 1))) / 2
  return { size, at: (slot: number) => first + slot * (size + gap) }
}

/**
 * Names each bar's value end, and opens a gap where stacked segments meet.
 * Bars arrive in stacking order, so on each side of the baseline the last
 * segment of a datum is the one with an end; each segment stacked on another
 * gives up the gap at its base, never at its value end, so a stack's total
 * still reads true against the axis.
 */
function finishBars(
  marks: Mark[],
  values: (number | undefined)[][],
  horizontal: boolean,
  stacked: boolean,
  shape?: BarShape,
): Mark[] {
  const last = new Map<string, number>()
  const seen = new Set<string>()
  for (const [i, mark] of marks.entries()) {
    if (mark.kind !== 'bar') continue
    const up = (values[mark.series]?.[mark.datum] ?? 0) >= 0
    const side = `${mark.datum}${up ? '+' : '-'}`
    last.set(stacked ? side : `${i}`, i)
    if (!stacked) continue
    if (seen.has(side)) {
      const length = horizontal ? mark.width : mark.height
      const gap = Math.min(shape?.gap ?? BAR_GAP, length / 2)
      if (horizontal) mark.width -= gap
      else mark.height -= gap
      if (horizontal === up) {
        if (horizontal) mark.x += gap
        else mark.y += gap
      }
    }
    seen.add(side)
  }
  for (const i of last.values()) {
    const mark = marks[i]
    if (mark?.kind !== 'bar') continue
    const up = (values[mark.series]?.[mark.datum] ?? 0) >= 0
    mark.end = horizontal ? (up ? 'right' : 'left') : up ? 'top' : 'bottom'
  }
  return marks
}

/**
 * A bar's outline with its value end rounded and its base square, so it
 * still stands on the baseline. The radius shrinks for a bar too small for it.
 */
export function barPath(
  x: number,
  y: number,
  width: number,
  height: number,
  end: BarEnd,
  radius = 4,
) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2))
  const [right, bottom] = [x + width, y + height]
  const p = (points: (readonly [number, number])[], arcs: number[]) =>
    `${points
      .map(([px, py], i) =>
        arcs.includes(i)
          ? `A${round(r)},${round(r)} 0 0 1 ${round(px)},${round(py)}`
          : `${i ? 'L' : 'M'}${round(px)},${round(py)}`,
      )
      .join('')}Z`
  // Clockwise from the base, with an arc into each corner at the end.
  switch (end) {
    case 'top':
      return p(
        [
          [x, bottom],
          [x, y + r],
          [x + r, y],
          [right - r, y],
          [right, y + r],
          [right, bottom],
        ],
        [2, 4],
      )
    case 'bottom':
      return p(
        [
          [right, y],
          [right, bottom - r],
          [right - r, bottom],
          [x + r, bottom],
          [x, bottom - r],
          [x, y],
        ],
        [2, 4],
      )
    case 'right':
      return p(
        [
          [x, y],
          [right - r, y],
          [right, y + r],
          [right, bottom - r],
          [right - r, bottom],
          [x, bottom],
        ],
        [2, 4],
      )
    case 'left':
      return p(
        [
          [right, bottom],
          [x + r, bottom],
          [x, bottom - r],
          [x, y + r],
          [x + r, y],
          [right, y],
        ],
        [2, 4],
      )
  }
}

export function nearest(centers: number[]) {
  return (x: number) => {
    let best = -1
    let distance = Number.POSITIVE_INFINITY
    for (const [i, center] of centers.entries()) {
      const d = Math.abs(center - x)
      if (d < distance) {
        distance = d
        best = i
      }
    }
    return best
  }
}

export function extent(values: (number | undefined)[][], includeZero: boolean): [number, number] {
  let lo = includeZero ? 0 : Number.POSITIVE_INFINITY
  let hi = includeZero ? 0 : Number.NEGATIVE_INFINITY
  for (const series of values)
    for (const value of series) {
      if (value === undefined) continue
      lo = Math.min(lo, value)
      hi = Math.max(hi, value)
    }
  return lo <= hi ? [lo, hi] : [0, 1]
}

/**
 * A stack's domain: positives stack up and negatives down from zero, so it
 * is the largest sum each way, not the largest value.
 */
function stackedExtent(values: (number | undefined)[][]): [number, number] {
  let lo = 0
  let hi = 0
  for (let datum = 0; datum < (values[0]?.length ?? 0); datum++) {
    let up = 0
    let down = 0
    for (const series of values) {
      const value = series[datum] ?? 0
      if (value >= 0) up += value
      else down += value
    }
    lo = Math.min(lo, down)
    hi = Math.max(hi, up)
  }
  return lo === hi ? [0, 1] : [lo, hi]
}

/**
 * Each series' band at each datum, `[from, to]` in data units: from the
 * baseline, or stacked on the series before it the way bars are. A gap has
 * no band, and adds nothing to the stack above it.
 */
function bands(
  values: (number | undefined)[][],
  stacked: boolean,
  baseline: number,
): ([number, number] | undefined)[][] {
  const up: number[] = []
  const down: number[] = []
  return values.map((column) =>
    column.map((value, datum) => {
      if (value === undefined) return undefined
      if (!stacked) return [baseline, value]
      const stack = value >= 0 ? up : down
      const from = stack[datum] ?? 0
      stack[datum] = from + value
      return [from, from + value]
    }),
  )
}

/**
 * A closed path per unbroken run of bands: along the tops, then back along
 * the bottoms. A run of one value has no width and draws nothing.
 */
export function areaPath(
  points: readonly (readonly [x: number, top: number, bottom: number] | undefined)[],
): string {
  let path = ''
  let run: (readonly [number, number, number])[] = []
  const close = () => {
    if (run.length > 1) {
      path += run.map(([x, top], i) => `${i ? 'L' : 'M'}${round(x)},${round(top)}`).join('')
      for (let i = run.length - 1; i >= 0; i--) {
        const [x, , bottom] = run[i] as readonly [number, number, number]
        path += `L${round(x)},${round(bottom)}`
      }
      path += 'Z'
    }
    run = []
  }
  for (const point of points) {
    if (point) run.push(point)
    else close()
  }
  close()
  return path
}

export function barChartModel(input: BarChartInput): ChartModel {
  const categories = categoriesOf(input)
  const values = input.series.map((series) => input.data.map((row) => rowValue(row, series.key)))
  const fontSize = input.fontSize ?? 12

  const domain = input.stacked ? stackedExtent(values) : extent(values, true)
  if (input.horizontal) return horizontalBars(input, categories, values, domain)
  const { plot, y, yTicks, references, legend } = frame(input, domain)
  const band: BandScale<number> = bandScale(
    input.data.map((_, i) => i),
    [plot.x, plot.x + plot.width],
    { paddingInner: 0.2, paddingOuter: 0.1 },
  )
  const centers = input.data.map((_, i) => (band(i) as number) + band.bandwidth / 2)
  const zero = y(Math.min(Math.max(0, y.domain[0]), y.domain[1]))
  const marks: Mark[] = []
  const groups = input.stacked ? 1 : Math.max(1, values.length)

  for (let datum = 0; datum < input.data.length; datum++) {
    let up = 0
    let down = 0
    for (const [series, column] of values.entries()) {
      const value = column[datum]
      if (value === undefined) continue
      let from = 0
      let to = value
      if (input.stacked) {
        from = value >= 0 ? up : down
        to = from + value
        if (value >= 0) up = to
        else down = to
      }
      const top = Math.min(y(from), y(to))
      const height = Math.abs(y(to) - y(from))
      const slots = barSlots(band(datum) as number, band.bandwidth, groups, input.bar)
      marks.push({
        kind: 'bar',
        series,
        datum,
        x: slots.at(input.stacked ? 0 : series),
        y: input.stacked ? top : Math.min(zero, y(value)),
        width: slots.size,
        height: input.stacked ? height : Math.abs(y(value) - zero),
      })
    }
  }

  return {
    width: input.width,
    height: input.height,
    plot,
    categories,
    values,
    marks: finishBars(marks, values, false, input.stacked ?? false, input.bar),
    xTicks: xTicks(categories, centers, band.step, fontSize),
    yTicks,
    references,
    legend,
    centers,
    datumAt: nearest(centers),
  }
}

/**
 * Bars and lines over one category axis, as for revenue and its margin.
 * The bar series share each band side by side; a line runs through the
 * band centres. One y axis, so it includes zero for the bars. Bars are
 * drawn first, so every line stays visible.
 */
export function composedChartModel(input: ComposedChartInput): ChartModel {
  const categories = categoriesOf(input)
  const values = input.series.map((series) => input.data.map((row) => rowValue(row, series.key)))
  const fontSize = input.fontSize ?? 12
  const { plot, y, yTicks, references, legend } = frame(input, extent(values, true))
  const band: BandScale<number> = bandScale(
    input.data.map((_, i) => i),
    [plot.x, plot.x + plot.width],
    { paddingInner: 0.2, paddingOuter: 0.1 },
  )
  const centers = input.data.map((_, i) => (band(i) as number) + band.bandwidth / 2)
  const zero = y(Math.min(Math.max(0, y.domain[0]), y.domain[1]))
  const barSeries = input.series.flatMap((entry, i) => (entry.type === 'line' ? [] : [i]))
  const marks: Mark[] = []
  for (const [slot, series] of barSeries.entries())
    for (const [datum, value] of (values[series] ?? []).entries()) {
      if (value === undefined) continue
      const slots = barSlots(
        band(datum) as number,
        band.bandwidth,
        Math.max(1, barSeries.length),
        input.bar,
      )
      marks.push({
        kind: 'bar',
        series,
        datum,
        x: slots.at(slot),
        y: Math.min(zero, y(value)),
        width: slots.size,
        height: Math.abs(y(value) - zero),
      })
    }
  finishBars(marks, values, false, false)
  for (const [series, entry] of input.series.entries()) {
    if (entry.type !== 'line') continue
    const points = (values[series] ?? []).map((value, datum) =>
      value === undefined ? undefined : ([centers[datum] as number, y(value)] as const),
    )
    marks.push({ kind: 'line', series, path: linePath(points) })
    for (const [datum, point] of points.entries())
      if (point) marks.push({ kind: 'point', series, datum, cx: point[0], cy: point[1] })
  }
  return {
    width: input.width,
    height: input.height,
    plot,
    categories,
    values,
    marks,
    xTicks: xTicks(categories, centers, band.step, fontSize),
    yTicks,
    references,
    legend,
    centers,
    datumAt: nearest(centers),
  }
}

/**
 * Bars along x. The category labels set the left margin, and the value
 * labels, centred under their ticks, set the right one, so the last label
 * is not cut off.
 */
function horizontalBars(
  input: BarChartInput,
  categories: string[],
  values: (number | undefined)[][],
  domain: [number, number],
): ChartModel {
  const fontSize = input.fontSize ?? 12
  const format = input.y?.format ?? defaultFormat
  const gap = fontSize / 2
  const widestCategory = Math.max(
    0,
    ...categories.map((label) => estimateTextWidth(label, fontSize)),
  )
  const left =
    input.margin?.left ?? Math.ceil(widestCategory + gap * 2 + (input.x.label ? fontSize + gap : 0))
  // The series key first, then reference labels above the plot, over their line.
  const legend = seriesLegend(input)
  const top =
    input.margin?.top ?? gap + legend.height + (input.references?.length ? fontSize * 1.4 : 0)
  const bottom = input.margin?.bottom ?? fontSize + gap * 2 + (input.y?.label ? fontSize + gap : 0)
  const plotHeight = Math.max(0, input.height - top - bottom)
  const roughWidth = Math.max(0, input.width - left - gap * 2)
  const count = Math.max(2, Math.floor(roughWidth / 80))
  const [lo, hi] = withReferences(domain, input.references)
  const [d0, d1] = input.y?.domain ?? niceDomain(lo, hi, count)
  const tickValues = linearScale([d0, d1], [0, 1]).ticks(count)
  const labels = tickValues.map(format)
  const lastLabel = estimateTextWidth(labels.at(-1) ?? '', fontSize)
  const right = input.margin?.right ?? Math.ceil(Math.max(gap * 2, lastLabel / 2 + gap))
  const plot = {
    x: left,
    y: top,
    width: Math.max(0, input.width - left - right),
    height: plotHeight,
  }
  const x = linearScale([d0, d1], [plot.x, plot.x + plot.width])
  const references = placeReferences(input.references, x)
  const band: BandScale<number> = bandScale(
    input.data.map((_, i) => i),
    [plot.y, plot.y + plot.height],
    { paddingInner: 0.2, paddingOuter: 0.1 },
  )
  const centers = input.data.map((_, i) => (band(i) as number) + band.bandwidth / 2)
  const zero = Math.min(Math.max(0, d0), d1)
  const groups = input.stacked ? 1 : Math.max(1, values.length)
  const marks: Mark[] = []
  for (const [series, column] of bands(values, input.stacked ?? false, zero).entries())
    for (const [datum, span] of column.entries()) {
      if (!span) continue
      const [a, b] = [x(span[0]), x(span[1])]
      const slots = barSlots(band(datum) as number, band.bandwidth, groups, input.bar)
      marks.push({
        kind: 'bar',
        series,
        datum,
        x: Math.min(a, b),
        y: slots.at(input.stacked ? 0 : series),
        width: Math.abs(b - a),
        height: slots.size,
      })
    }
  finishBars(marks, values, true, input.stacked ?? false, input.bar)
  // Every n-th category, so that labels a line apart do not overlap.
  const every = band.step > 0 ? Math.max(1, Math.ceil((fontSize * 1.2) / band.step)) : 1
  const yTicks: Tick[] = []
  for (let i = 0; i < categories.length; i += every)
    yTicks.push({ position: centers[i] as number, label: categories[i] as string })
  return {
    width: input.width,
    height: input.height,
    plot,
    categories,
    values,
    marks,
    xTicks: tickValues.map((value, i) => ({ position: x(value), label: labels[i] as string })),
    yTicks,
    references,
    legend: legend.keys,
    centers,
    datumAt: (px, py) => nearest(centers)(py ?? px),
    horizontal: true,
  }
}

/**
 * An SVG path through `points`, broken at each gap: a missing value must
 * not be drawn as a line across it, which would show a value nobody gave.
 */
export function linePath(points: readonly (readonly [number, number] | undefined)[]): string {
  let path = ''
  let drawing = false
  for (const point of points) {
    if (!point) {
      drawing = false
      continue
    }
    path += `${drawing ? 'L' : 'M'}${round(point[0])},${round(point[1])}`
    drawing = true
  }
  return path
}

const round = (value: number) => Math.round(value * 100) / 100

export function lineChartModel(input: ChartInput): ChartModel {
  return pointChart(input, undefined)
}

/**
 * Lines with the band under each filled. Unstacked, the bands run down to
 * zero, so zero is in the domain; stacked, each line is the running total
 * and the table still reads each series' own value.
 */
export function areaChartModel(input: AreaChartInput): ChartModel {
  return pointChart(input, input.stacked ?? false)
}

/** Line and Area: one point per datum, a line through each series, and for Area its bands. */
function pointChart(input: ChartInput, area: boolean | undefined): ChartModel {
  const categories = categoriesOf(input)
  const values = input.series.map((series) => input.data.map((row) => rowValue(row, series.key)))
  const fontSize = input.fontSize ?? 12
  const domain =
    area === undefined ? extent(values, false) : area ? stackedExtent(values) : extent(values, true)
  const { plot, y, yTicks, references, legend } = frame(input, domain)
  const x: BandScale<number> = pointScale(
    input.data.map((_, i) => i),
    [plot.x, plot.x + plot.width],
    { padding: 0.5 },
  )
  const centers = input.data.map((_, i) => x(i) as number)
  const marks: Mark[] = []
  const baseline = Math.min(Math.max(0, y.domain[0]), y.domain[1])
  const spans = bands(values, area ?? false, baseline)
  // Bands first, so every line and dot is drawn over every fill.
  if (area !== undefined)
    for (const [series, column] of spans.entries())
      marks.push({
        kind: 'area',
        series,
        path: areaPath(
          column.map((span, datum) =>
            span ? [centers[datum] as number, y(span[1]), y(span[0])] : undefined,
          ),
        ),
        opacity: area ? 0.7 : 0.25,
      })
  for (const [series, column] of spans.entries()) {
    const points = column.map((span, datum) =>
      span === undefined ? undefined : ([centers[datum] as number, y(span[1])] as const),
    )
    marks.push({ kind: 'line', series, path: linePath(points) })
    for (const [datum, point] of points.entries())
      if (point) marks.push({ kind: 'point', series, datum, cx: point[0], cy: point[1] })
  }
  return {
    width: input.width,
    height: input.height,
    plot,
    categories,
    values,
    marks,
    xTicks: xTicks(categories, centers, x.step, fontSize),
    yTicks,
    references,
    legend,
    centers,
    datumAt: nearest(centers),
  }
}
