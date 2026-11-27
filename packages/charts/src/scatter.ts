// A scatter plot: two numeric axes, one dot per row and series (RFC 015 §8).
//
// A point has no category to step along, so the rows are put in x order
// and that order is the one the keys, the table and the summary share. A
// row is named by its `name` field, or by its x value when it has none;
// either way its x value is read with it, so the sentence "Acme, Price:
// $12. Rating: 4.5." says where the point is on both axes.

import {
  type ChartInput,
  type ChartModel,
  type ChartYAxis,
  defaultFormat,
  estimateTextWidth,
  extent,
  frame,
  type Mark,
  rowValue,
  type Tick,
} from './model.ts'
import { linearScale, niceDomain } from './scale.ts'

export interface ScatterXAxis {
  /** The field of each row that holds its x value. */
  key: string
  label?: string
  format?: (value: number) => string
  /** A fixed domain; otherwise the data's, widened to round ticks. */
  domain?: readonly [number, number]
}

export interface ScatterName {
  /** The field of each row that names its point. */
  key: string
  /** The header of the name column; "Name" when absent. */
  label?: string
}

export interface ScatterChartInput extends Omit<ChartInput, 'x'> {
  x: ScatterXAxis
  y?: ChartYAxis
  name?: ScatterName
}

/** The rows that have an x value, in x order; ties keep their data order. */
function ordered(input: ScatterChartInput): { rows: Record<string, unknown>[]; xs: number[] } {
  const keyed: [number, number][] = []
  for (const [i, row] of input.data.entries()) {
    const value = rowValue(row, input.x.key)
    if (value !== undefined) keyed.push([value, i])
  }
  keyed.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  return {
    rows: keyed.map(([, i]) => input.data[i] as Record<string, unknown>),
    xs: keyed.map(([value]) => value),
  }
}

export function scatterChartModel(input: ScatterChartInput): ChartModel {
  const fontSize = input.fontSize ?? 12
  const gap = fontSize / 2
  const formatX = input.x.format ?? defaultFormat
  const { rows, xs } = ordered(input)
  const xLabels = xs.map(formatX)
  const categories = input.name
    ? rows.map((row) => String(row[input.name?.key as string] ?? ''))
    : xLabels
  const values = input.series.map((series) => rows.map((row) => rowValue(row, series.key)))

  // The x ticks first, at a rough width, because the last label sets the
  // right margin the y frame then lays out with.
  const roughWidth = Math.max(0, input.width - 60)
  const count = Math.max(2, Math.floor(roughWidth / 80))
  const lo = xs[0] ?? 0
  const hi = xs.at(-1) ?? 1
  const [x0, x1] = input.x.domain ?? niceDomain(lo, hi === lo ? lo + 1 : hi, count)
  const tickValues = linearScale([x0, x1], [0, 1]).ticks(count)
  const tickLabels = tickValues.map(formatX)
  const last = estimateTextWidth(tickLabels.at(-1) ?? '', fontSize)
  const right = input.margin?.right ?? Math.ceil(Math.max(gap * 2, last / 2 + gap))
  const { plot, y, yTicks } = frame(
    { ...input, x: { key: input.x.key, label: input.x.label }, margin: { ...input.margin, right } },
    extent(values, false),
  )
  const x = linearScale([x0, x1], [plot.x, plot.x + plot.width])
  const centers = xs.map((value) => x(value))
  const marks: Mark[] = []
  for (const [series, column] of values.entries())
    for (const [datum, value] of column.entries())
      if (value !== undefined)
        marks.push({ kind: 'point', series, datum, cx: centers[datum] as number, cy: y(value) })
  const xTicks: Tick[] = tickValues.map((value, i) => ({
    position: x(value),
    label: tickLabels[i] as string,
  }))

  return {
    width: input.width,
    height: input.height,
    plot,
    categories,
    values,
    marks,
    xTicks,
    yTicks,
    centers,
    // The dot nearest the pointer in both directions; by x alone when there
    // is no y, as for a touch that only reports a column.
    datumAt(px, py) {
      let best = -1
      let distance = Number.POSITIVE_INFINITY
      for (const mark of marks) {
        if (mark.kind !== 'point') continue
        const d = Math.hypot(mark.cx - px, py === undefined ? 0 : mark.cy - py)
        if (d < distance) {
          distance = d
          best = mark.datum
        }
      }
      return best
    },
    xColumn: {
      label: input.x.label ?? 'X',
      values: xLabels,
      missing: input.data.length - rows.length,
      inTable: input.name !== undefined,
    },
  }
}
