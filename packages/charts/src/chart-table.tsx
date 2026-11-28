// The accessible equivalent of a chart: a table of its data (RFC 015 §5).
//
// Built from the model's categories and values, never from the marks: a
// reader wants "March, Online: 90", not the height of a rectangle. It goes
// through @hozo/semantics' table, so Web gets `<table>` and Native the
// table semantics that component already gives a screen reader.

import { HozoTable, HozoTableCell, HozoTableRow, HozoTableSection } from '@hozo/semantics'
import type { ChartModel, ChartSeries } from './model.ts'
import { NO_VALUE } from './no-value.ts'

export interface ChartTableProps {
  model: ChartModel
  series: readonly ChartSeries[]
  accessibilityLabel: string
  /** The header of the category column. */
  categoryLabel?: string
  format?: (value: number) => string
}

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
          {model.xColumn?.inTable ? (
            <HozoTableCell head scope="col">
              {model.xColumn.label}
            </HozoTableCell>
          ) : null}
          {model.tree ? (
            <HozoTableCell head scope="col">
              Group
            </HozoTableCell>
          ) : null}
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
            {model.xColumn?.inTable ? (
              <HozoTableCell>{model.xColumn.values[datum]}</HozoTableCell>
            ) : null}
            {model.tree ? (
              <HozoTableCell>
                {model.categories[model.tree.parent[datum] ?? -1] ?? model.tree.rootLabel}
              </HozoTableCell>
            ) : null}
            {series.map((entry, index) => {
              const value = model.values[index]?.[datum]
              return (
                <HozoTableCell key={entry.key}>
                  {value === undefined ? NO_VALUE : (entry.format ?? format)(value)}
                </HozoTableCell>
              )
            })}
          </HozoTableRow>
        ))}
      </HozoTableSection>
    </HozoTable>
  )
}
