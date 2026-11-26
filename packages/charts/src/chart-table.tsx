// The accessible equivalent of a chart: a table of its data (RFC 015 §5).
//
// Built from the model's categories and values, never from the marks: a
// reader wants "March, Online: 90", not the height of a rectangle. It goes
// through @hozo/semantics' table, so Web gets `<table>` and Native the
// table semantics that component already gives a screen reader.

import { HozoTable, HozoTableCell, HozoTableRow, HozoTableSection } from '@hozo/semantics'
import type { ChartModel, ChartSeries } from './model.ts'

export interface ChartTableProps {
  model: ChartModel
  series: readonly ChartSeries[]
  accessibilityLabel: string
  /** The header of the category column. */
  categoryLabel?: string
  format?: (value: number) => string
}

/** What a gap reads as: never "0", which would be a value nobody gave. */
export const NO_VALUE = 'No value'

export function ChartTable({
  model,
  series,
  accessibilityLabel,
  categoryLabel = 'Category',
  format = String,
}: ChartTableProps) {
  return (
    <HozoTable accessibilityLabel={accessibilityLabel}>
      <HozoTableSection section="header">
        <HozoTableRow>
          <HozoTableCell head scope="col">
            {categoryLabel}
          </HozoTableCell>
          {series.map((entry) => (
            <HozoTableCell key={entry.key} head scope="col">
              {entry.label}
            </HozoTableCell>
          ))}
        </HozoTableRow>
      </HozoTableSection>
      <HozoTableSection section="body">
        {model.categories.map((category, datum) => (
          // Categories may repeat; the row's position is its identity.
          // biome-ignore lint/suspicious/noArrayIndexKey: rows follow the data's order
          <HozoTableRow key={datum}>
            <HozoTableCell head scope="row">
              {category}
            </HozoTableCell>
            {series.map((entry, index) => {
              const value = model.values[index]?.[datum]
              return (
                <HozoTableCell key={entry.key}>
                  {value === undefined ? NO_VALUE : format(value)}
                </HozoTableCell>
              )
            })}
          </HozoTableRow>
        ))}
      </HozoTableSection>
    </HozoTable>
  )
}
