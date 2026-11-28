// What a chart says before any one value: how many categories, the range
// they cover, and each series' lowest and highest point. A reader gets the
// shape at once instead of building it from rows, and at a size where a row
// per category is too many to list, it is what a reader has in place of the
// table (docs/measurements/charts-scale.md).

import { KEPT_LABEL } from './funnel.ts'
import type { ChartModel, ChartSeries } from './model.ts'

/**
 * Above this many categories the table is left out unless `showTable` asks
 * for it. At 1,000 rows the table costs about 45 ms to draw, at 20,000 about
 * 350 ms, and nobody reads twenty thousand rows one at a time.
 */
export const TABLE_ROW_LIMIT = 1000

/** Whether the table is drawn: always when shown, else only up to the limit. */
export function includesTable(count: number, showTable: boolean): boolean {
  return showTable || count <= TABLE_ROW_LIMIT
}

/**
 * "Kept from the stage before: Signup 40%, Trial 50%. Trial is 20% of
 * Visit." Each stage that has a share, then the last stage against the
 * first, which is the funnel's overall rate.
 */
function funnelSentence(model: ChartModel, read: (value: number) => string): string {
  const { categories } = model
  const kept = model.values[1] ?? []
  const counts = model.values[0] ?? []
  const shares = kept.flatMap((share, i) =>
    share === undefined ? [] : [`${categories[i]} ${read(share)}`],
  )
  const parts = [
    shares.length > 0 ? `${KEPT_LABEL}: ${shares.join(', ')}.` : `${KEPT_LABEL}: none.`,
  ]
  const first = counts[0]
  const last = counts[counts.length - 1]
  if (counts.length > 2 && first !== undefined && first > 0 && last !== undefined)
    parts.push(`${categories[counts.length - 1]} is ${read(last / first)} of ${categories[0]}.`)
  return parts.join(' ')
}

/**
 * "3 categories, Jan to Mar. Online: lowest $90 at Mar, highest $200 at
 * Feb. In store: lowest $60 at Mar, highest $80 at Jan, 1 without a value."
 */
export function chartSummary(
  model: ChartModel,
  series: readonly ChartSeries[],
  format: (value: number) => string = String,
  tableOmitted = false,
): string {
  const { categories } = model
  const count = categories.length
  if (count === 0) return 'No data.'
  const x = model.xColumn
  const parts: string[] = []
  if (x) {
    // Rows are in x order, so the first and last give the x range.
    const first = x.values[0] ?? ''
    const last = x.values[count - 1] ?? ''
    const range = count === 1 ? `${x.label} ${first}` : `${x.label} from ${first} to ${last}`
    parts.push(`${count.toLocaleString('en-US')} ${count === 1 ? 'point' : 'points'}, ${range}.`)
  } else {
    const noun = count === 1 ? 'category' : 'categories'
    const range = count === 1 ? `${categories[0]}` : `${categories[0]} to ${categories[count - 1]}`
    parts.push(`${count.toLocaleString('en-US')} ${noun}, ${range}.`)
  }
  // Each value is read as given; the scale only says why the drawing looks as it does.
  if (model.log) parts.push('Values on a log scale.')
  series.forEach((entry, index) => {
    const values = model.values[index] ?? []
    const read = entry.format ?? format
    // A funnel's second series is read stage by stage: what each kept of the
    // one before is the point of a funnel, and its extremes alone are not.
    if (model.funnel && index === 1) {
      parts.push(funnelSentence(model, read))
      return
    }
    let low = -1
    let high = -1
    let gaps = 0
    for (let i = 0; i < count; i++) {
      const value = values[i]
      if (value === undefined) {
        gaps++
        continue
      }
      if (low < 0 || value < (values[low] as number)) low = i
      if (high < 0 || value > (values[high] as number)) high = i
    }
    const missing = gaps > 0 ? `, ${gaps.toLocaleString('en-US')} without a value` : ''
    parts.push(
      low < 0
        ? `${entry.label}: no values.`
        : `${entry.label}: lowest ${read(values[low] as number)} at ${categories[low]}, ` +
            `highest ${read(values[high] as number)} at ${categories[high]}${missing}.`,
    )
  })
  // A reference is what the values are read against, so it comes after them.
  for (const reference of model.references)
    parts.push(
      reference.to === undefined
        ? `${reference.label}: ${format(reference.value)}.`
        : `${reference.label}: ${format(reference.value)} to ${format(reference.to)}.`,
    )
  if (x && x.missing > 0)
    parts.push(
      `${x.missing.toLocaleString('en-US')} ${x.missing === 1 ? 'row' : 'rows'} without ${x.label} left out.`,
    )
  if (tableOmitted) parts.push('Too many to list as a table; step through them on the chart.')
  return parts.join(' ')
}
