import { type CSSProperties, useId } from 'react'
import { useWindowedTable, type WindowedTableProps } from './windowed-table-types.ts'

export type { WindowedTableColumn, WindowedTableProps } from './windowed-table-types.ts'

/** Full semantic table on Web; only the Native counterpart windows rows. */
export function WindowedTable<Row>(props: WindowedTableProps<Row>) {
  const { data, columns, rowHeight, accessibilityLabel } = props
  const { width, height, keys } = useWindowedTable(props)
  const id = useId()
  const cell: CSSProperties = { padding: 0, verticalAlign: 'top', textAlign: 'start' }
  const content: CSSProperties = {
    height: rowHeight,
    boxSizing: 'border-box',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
  }
  return (
    <div style={{ maxHeight: height, overflow: 'auto' }}>
      <table
        aria-label={accessibilityLabel}
        style={{ width, tableLayout: 'fixed', borderCollapse: 'collapse', borderSpacing: 0 }}
      >
        <colgroup>
          {columns.map((column) => (
            <col key={column.key} style={{ width: column.width }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((column, index) => (
              <th key={column.key} id={`${id}-column-${index}`} scope="col" style={cell}>
                <div style={content}>
                  <div style={{ padding: 4 }}>{column.header}</div>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, index) => (
            <tr key={keys[index]}>
              {columns.map((column, columnIndex) => {
                const text = column.getText(row)
                return (
                  <td
                    key={column.key}
                    headers={`${id}-column-${columnIndex}`}
                    aria-label={text}
                    style={cell}
                  >
                    <div style={content} aria-hidden={column.renderCell ? true : undefined}>
                      <div style={{ padding: 4 }}>
                        {column.renderCell ? column.renderCell(text, row) : text}
                      </div>
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
