// One active datum, shared by keyboard, pointer, touch, the tooltip and
// what a screen reader hears (RFC 015 §5). Pure, so both boxes and the
// renderer read the same answer.

import { type ChartModel, type ChartSeries, estimateTextWidth } from './model.ts'
import { NO_VALUE } from './no-value.ts'
import { seriesColor } from './palette.ts'

/** The keys a chart answers, and where each moves the active datum. */
export function nextDatum(
  key: string,
  active: number | undefined,
  count: number,
  horizontal = false,
): number | undefined {
  if (count === 0) return undefined
  const at = active ?? -1
  // Categories run down a horizontal bar chart, so Down and Up step
  // through them too; Right and Left still do, as on every chart.
  if (horizontal && key === 'ArrowDown') key = 'ArrowRight'
  if (horizontal && key === 'ArrowUp') key = 'ArrowLeft'
  switch (key) {
    case 'ArrowRight':
      return active === undefined ? 0 : Math.min(count - 1, at + 1)
    case 'ArrowLeft':
      return active === undefined ? count - 1 : Math.max(0, at - 1)
    // A tenth of the data per press, so a long series is crossed in ten.
    case 'PageDown':
      return Math.min(count - 1, at + Math.max(1, Math.round(count / 10)))
    case 'PageUp':
      return Math.max(0, (active ?? count) - Math.max(1, Math.round(count / 10)))
    case 'Home':
      return 0
    case 'End':
      return count - 1
    default:
      return undefined
  }
}

export interface DatumRow {
  label: string
  value: string
  color: string
}

/** Every series' value at `datum`, formatted; a gap reads as one. */
export function datumRows(
  model: ChartModel,
  series: readonly ChartSeries[],
  datum: number,
  format: (value: number) => string = String,
): DatumRow[] {
  return series.map((entry, index) => {
    const value = model.values[index]?.[datum]
    return {
      label: entry.label,
      value: value === undefined ? NO_VALUE : format(value),
      color: seriesColor(index, entry.color),
    }
  })
}

/**
 * What a datum is called when read: its category, or for a scatter point
 * its name and x value ("Acme, Price: $12"), or its x value alone.
 */
export function datumTitle(model: ChartModel, datum: number): string {
  const category = model.categories[datum] ?? ''
  const x = model.xColumn
  if (!x) return category
  const at = `${x.label}: ${x.values[datum] ?? ''}`
  return x.inTable ? `${category}, ${at}` : at
}

/**
 * What a reader hears for `datum`: "Mar. Online: 90. In store: 60." All
 * series at once, so moving along x is the only navigation a reader needs.
 */
export function datumSentence(
  model: ChartModel,
  series: readonly ChartSeries[],
  datum: number,
  format?: (value: number) => string,
): string {
  const category = datumTitle(model, datum)
  const rows = datumRows(model, series, datum, format)
  return [category, ...rows.map((row) => `${row.label}: ${row.value}`)].join('. ').concat('.')
}

export interface TooltipBox {
  x: number
  y: number
  width: number
  height: number
  lineHeight: number
  padding: number
}

/**
 * Where the tooltip for `datum` sits: beside the datum's centre, on the
 * side with room, and inside the chart vertically.
 */
export function tooltipBox(
  model: ChartModel,
  title: string,
  rows: readonly DatumRow[],
  fontSize: number,
  datum: number,
): TooltipBox {
  const padding = fontSize * 0.6
  const lineHeight = fontSize * 1.4
  const swatch = fontSize
  const widest = Math.max(
    estimateTextWidth(title, fontSize),
    ...rows.map((row) => swatch + estimateTextWidth(`${row.label}: ${row.value}`, fontSize)),
  )
  const width = Math.ceil(widest + padding * 2)
  const height = Math.ceil(lineHeight * (rows.length + 1) + padding * 2)
  const center = model.centers[datum] ?? 0
  const gap = fontSize
  if (model.horizontal) {
    // Below the category's band if it fits, else above, at the plot's right.
    const half = model.plot.height / Math.max(1, model.centers.length) / 2
    const below = center + half + gap / 2
    const y = below + height <= model.height ? below : Math.max(0, center - half - gap / 2 - height)
    const x = Math.max(0, model.plot.x + model.plot.width - width)
    return { x, y, width, height, lineHeight, padding }
  }
  const right = center + gap
  const x = right + width <= model.width ? right : Math.max(0, center - gap - width)
  const y = Math.max(0, Math.min(model.plot.y, model.height - height))
  return { x, y, width, height, lineHeight, padding }
}
