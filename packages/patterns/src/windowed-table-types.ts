import { type ReactNode, useMemo } from 'react'

export interface WindowedTableColumn<Row> {
  /** Stable identity, independent of the column's position. */
  key: string
  header: string
  /** Exact logical pixels, shared by the header and every data cell. */
  width: number
  /** Full accessible value. On Native this runs only for rendered rows. */
  getText: (row: Row) => string
  /** Noninteractive decoration; return platform-appropriate elements. */
  renderCell?: (text: string, row: Row) => ReactNode
}

export interface WindowedTableProps<Row> {
  data: readonly Row[]
  getRowKey: (row: Row) => string
  columns: readonly WindowedTableColumn<Row>[]
  /** Includes cell padding. Recompute this when the user's font scale changes. */
  rowHeight: number
  maxHeight: number
  accessibilityLabel: string
}

function positive(value: number, name: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`WindowedTable ${name} must be finite and positive`)
  }
}

function unique(key: string, seen: Set<string>, name: string) {
  if (typeof key !== 'string' || key.length === 0 || seen.has(key)) {
    throw new TypeError(`WindowedTable ${name} must be nonempty and unique`)
  }
  seen.add(key)
  return key
}

export function useWindowedTable<Row>({
  data,
  getRowKey,
  columns,
  rowHeight,
  maxHeight,
}: WindowedTableProps<Row>) {
  positive(rowHeight, 'rowHeight')
  positive(maxHeight, 'maxHeight')
  const width = useMemo(() => {
    if (columns.length === 0) throw new TypeError('WindowedTable needs at least one column')
    const seen = new Set<string>()
    let total = 0
    for (const column of columns) {
      unique(column.key, seen, 'column keys')
      positive(column.width, 'column width')
      total += column.width
    }
    positive(total, 'total width')
    return total
  }, [columns])
  // Validate identity without formatting data or allocating offscreen cell trees.
  // Like FlatList, the caller supplies immutable data and a stable key getter.
  const keys = useMemo(() => {
    const seen = new Set<string>()
    return data.map((row) => unique(getRowKey(row), seen, 'row keys'))
  }, [data, getRowKey])
  return { width, keys, height: Math.min(maxHeight, (data.length + 1) * rowHeight) }
}
