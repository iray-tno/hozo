// What a chart says before any one value: how many categories, the range
// they cover, and each series' lowest and highest point. A reader gets the
// shape at once instead of building it from rows, and at a size where a row
// per category is too many to list, it is what a reader has in place of the
// table (docs/measurements/charts-scale.md).

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
  const noun = count === 1 ? 'category' : 'categories'
  const range = count === 1 ? `${categories[0]}` : `${categories[0]} to ${categories[count - 1]}`
  const parts = [`${count.toLocaleString('en-US')} ${noun}, ${range}.`]
  series.forEach((entry, index) => {
    const values = model.values[index] ?? []
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
        : `${entry.label}: lowest ${format(values[low] as number)} at ${categories[low]}, ` +
            `highest ${format(values[high] as number)} at ${categories[high]}${missing}.`,
    )
  })
  if (tableOmitted) parts.push('Too many to list as a table; step through them on the chart.')
  return parts.join(' ')
}
