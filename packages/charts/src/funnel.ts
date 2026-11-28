// Funnel layout: one row per stage, top to bottom in data order, each a
// trapezoid whose top edge is as wide as its value and whose bottom edge
// narrows to the next stage's, so the drop between two stages is the slope
// between them. It returns the same `ChartModel` as the other charts, with
// two series, the value and what each stage kept of the one before, so the
// table, the tooltip and the sentence read the drop without anything new.

import {
  type ChartModel,
  type ChartSeries,
  type ChartXAxis,
  defaultFormat,
  estimateTextWidth,
  type Mark,
  rowValue,
} from './model.ts'

export interface FunnelValue {
  /** The field of each row that holds its stage's count. */
  key: string
  /** What the value is, read with each stage: "Visitors: 1,000". */
  label: string
  format?: (value: number) => string
}

export interface FunnelChartInput {
  data: readonly Record<string, unknown>[]
  x: ChartXAxis
  value: FunnelValue
  width: number
  height: number
  fontSize?: number
}

export interface FunnelLabel {
  datum: number
  x: number
  y: number
  text: string
  anchor: 'start' | 'end'
}

export interface Funnel {
  /**
   * Each stage's value as a fraction of the stage before it; undefined for
   * the first, and where either value is missing or the one before is not
   * positive.
   */
  kept: (number | undefined)[]
  /** Stage names on the left and values on the right, in text colour. */
  labels: FunnelLabel[]
}

export type FunnelModel = ChartModel & { funnel: Funnel }

/** The second series' label, read in the table and with each stage. */
export const KEPT_LABEL = 'Kept from the stage before'

const round = (value: number) => Math.round(value * 100) / 100

/** A fraction as a percentage, to one decimal where it needs one: "40%", "12.5%". */
export function percent(fraction: number): string {
  return `${Number((fraction * 100).toFixed(1))}%`
}

/** Each value as a fraction of the one before it. */
export function keptFractions(values: readonly (number | undefined)[]): (number | undefined)[] {
  return values.map((value, i) => {
    const before = values[i - 1]
    return i === 0 || value === undefined || before === undefined || before <= 0
      ? undefined
      : value / before
  })
}

/** The value series and the kept series, each with its own format. */
export function funnelSeries(value: FunnelValue): ChartSeries[] {
  return [
    { key: value.key, label: value.label, format: value.format },
    { key: `${value.key}:kept`, label: KEPT_LABEL, format: percent },
  ]
}

/** A stage's trapezoid, centred on `cx`: `top` wide at `y`, `bottom` wide `height` below. */
function trapezoid(cx: number, y: number, top: number, bottom: number, height: number): string {
  const t = top / 2
  const b = bottom / 2
  return (
    `M${round(cx - t)},${round(y)}L${round(cx + t)},${round(y)}` +
    `L${round(cx + b)},${round(y + height)}L${round(cx - b)},${round(y + height)}Z`
  )
}

export function funnelChartModel(input: FunnelChartInput): FunnelModel {
  const fontSize = input.fontSize ?? 12
  const format = input.x.format ?? ((value: unknown) => String(value ?? ''))
  const valueFormat = input.value.format ?? defaultFormat
  const categories = input.data.map((row) => format(row[input.x.key]))
  // Zero, negative and missing values have no width to draw; the table and
  // the sentence still read them.
  const column = input.data.map((row) => rowValue(row, input.value.key))
  const kept = keptFractions(column)
  const count = categories.length
  const widest = Math.max(0, ...column.map((value) => (value && value > 0 ? value : 0)))

  // The names right-aligned on the left and the values left-aligned on the
  // right, so neither sits on a stage too narrow to hold it.
  const gap = fontSize
  const valueText = column.map((value, i) => {
    if (value === undefined) return ''
    const share = kept[i]
    return share === undefined ? valueFormat(value) : `${valueFormat(value)} (${percent(share)})`
  })
  const nameWidth = Math.max(0, ...categories.map((name) => estimateTextWidth(name, fontSize)))
  const valueWidth = Math.max(0, ...valueText.map((text) => estimateTextWidth(text, fontSize)))
  const plotX = Math.min(input.width / 2, nameWidth + gap)
  const plotWidth = Math.max(0, input.width - plotX - valueWidth - gap)
  const plot = { x: plotX, y: 0, width: plotWidth, height: input.height }
  const cx = plot.x + plot.width / 2

  // A 2px gap of surface between stages, so neighbours of one colour stay two shapes.
  const spacer = count > 1 ? 2 : 0
  const band = count > 0 ? (plot.height - spacer * (count - 1)) / count : 0
  const size = (value: number | undefined) =>
    value !== undefined && value > 0 && widest > 0 ? (value / widest) * plot.width : 0

  const marks: Mark[] = []
  const labels: FunnelLabel[] = []
  const centers: number[] = []
  for (let datum = 0; datum < count; datum++) {
    const y = datum * (band + spacer)
    const middle = round(y + band / 2)
    centers.push(middle)
    const baseline = round(middle + fontSize * 0.35)
    labels.push({
      datum,
      x: plot.x - gap / 2,
      y: baseline,
      text: categories[datum] ?? '',
      anchor: 'end',
    })
    if (valueText[datum])
      labels.push({
        datum,
        x: plot.x + plot.width + gap / 2,
        y: baseline,
        text: valueText[datum] as string,
        anchor: 'start',
      })
    const top = size(column[datum])
    if (top <= 0) continue
    // The last stage, and one before a stage with nothing to narrow to,
    // keeps its width to the bottom.
    const next = size(column[datum + 1])
    const bottom = datum < count - 1 && next > 0 ? next : top
    marks.push({
      kind: 'stage',
      series: 0,
      datum,
      path: trapezoid(cx, y, top, bottom, band),
    })
  }

  return {
    width: input.width,
    height: input.height,
    plot,
    categories,
    values: [column, kept],
    marks,
    xTicks: [],
    yTicks: [],
    centers,
    // Stages run down the chart, as horizontal bars' categories do, so the
    // arrow keys and the tooltip treat them the same way.
    horizontal: true,
    datumAt(_x: number, y = 0) {
      if (count === 0 || y < plot.y || y > plot.y + plot.height) return -1
      return Math.min(count - 1, Math.max(0, Math.floor((y - plot.y) / (band + spacer))))
    },
    funnel: { kept, labels },
    references: [],
  }
}
