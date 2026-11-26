// The chart model: data and a chart definition in, plot geometry and marks
// out (RFC 015 §4). Pure: no React, no platform, so the SVG renderer, a
// later Canvas renderer and the accessible table all read one answer.

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
}

export interface BarChartInput extends ChartInput {
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
    }
  | { kind: 'line'; series: number; path: string }
  | { kind: 'point'; series: number; datum: number; cx: number; cy: number }

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
  /** The datum nearest to an x position inside the chart, or -1 with no data. */
  datumAt(x: number): number
}

/** A row's value: finite, or a gap. A string or null is a gap, not zero. */
export function rowValue(row: Record<string, unknown>, key: string): number | undefined {
  const value = row[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

const defaultFormat = (value: number) => {
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

interface Frame {
  margin: Margin
  plot: ChartModel['plot']
  y: LinearScale
  yTicks: Tick[]
}

/** Margins and the y scale, which depend on each other through the tick labels. */
function frame(input: ChartInput, domain: [number, number]): Frame {
  const fontSize = input.fontSize ?? 12
  const format = input.y?.format ?? defaultFormat
  const gap = fontSize / 2
  const top = input.margin?.top ?? gap
  const bottom = input.margin?.bottom ?? fontSize + gap * 2 + (input.x.label ? fontSize + gap : 0)
  const plotHeight = Math.max(0, input.height - top - bottom)
  const count = Math.max(2, Math.floor(plotHeight / 40))
  const [d0, d1] = input.y?.domain ?? niceDomain(domain[0], domain[1], count)
  const y = linearScale([d0, d1], [top + plotHeight, top])
  const tickValues = y.ticks(count)
  const labels = tickValues.map(format)
  const widest = Math.max(0, ...labels.map((label) => estimateTextWidth(label, fontSize)))
  const left =
    input.margin?.left ?? Math.ceil(widest + gap * 2 + (input.y?.label ? fontSize + gap : 0))
  const right = input.margin?.right ?? gap * 2
  const margin = { top, right, bottom, left }
  return {
    margin,
    plot: { x: left, y: top, width: Math.max(0, input.width - left - right), height: plotHeight },
    y,
    yTicks: tickValues.map((value, i) => ({ position: y(value), label: labels[i] as string })),
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

function nearest(centers: number[]) {
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

function extent(values: (number | undefined)[][], includeZero: boolean): [number, number] {
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

export function barChartModel(input: BarChartInput): ChartModel {
  const categories = categoriesOf(input)
  const values = input.series.map((series) => input.data.map((row) => rowValue(row, series.key)))
  const fontSize = input.fontSize ?? 12

  // Stacked bars stack positives up and negatives down from zero, so the
  // domain is the largest sum each way, not the largest value.
  let domain: [number, number]
  if (input.stacked) {
    let lo = 0
    let hi = 0
    for (let datum = 0; datum < input.data.length; datum++) {
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
    domain = lo === hi ? [0, 1] : [lo, hi]
  } else domain = extent(values, true)

  const { plot, y, yTicks } = frame(input, domain)
  const band: BandScale<number> = bandScale(
    input.data.map((_, i) => i),
    [plot.x, plot.x + plot.width],
    { paddingInner: 0.2, paddingOuter: 0.1 },
  )
  const centers = input.data.map((_, i) => (band(i) as number) + band.bandwidth / 2)
  const zero = y(Math.min(Math.max(0, y.domain[0]), y.domain[1]))
  const marks: Mark[] = []
  const groups = input.stacked ? 1 : Math.max(1, values.length)
  const width = band.bandwidth / groups

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
      marks.push({
        kind: 'bar',
        series,
        datum,
        x: (band(datum) as number) + (input.stacked ? 0 : series * width),
        y: input.stacked ? top : Math.min(zero, y(value)),
        width,
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
    marks,
    xTicks: xTicks(categories, centers, band.step, fontSize),
    yTicks,
    centers,
    datumAt: nearest(centers),
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
  const categories = categoriesOf(input)
  const values = input.series.map((series) => input.data.map((row) => rowValue(row, series.key)))
  const fontSize = input.fontSize ?? 12
  const { plot, y, yTicks } = frame(input, extent(values, false))
  const x: BandScale<number> = pointScale(
    input.data.map((_, i) => i),
    [plot.x, plot.x + plot.width],
    { padding: 0.5 },
  )
  const centers = input.data.map((_, i) => x(i) as number)
  const marks: Mark[] = []
  for (const [series, column] of values.entries()) {
    const points = column.map((value, datum) =>
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
    xTicks: xTicks(categories, centers, x.step, fontSize),
    yTicks,
    centers,
    datumAt: nearest(centers),
  }
}
