import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  WindowedTable,
  type WindowedTableColumn,
  type WindowedTableProps,
} from './windowed-table.tsx'

const data = Array.from({ length: 1000 }, (_, index) => ({
  id: String(index),
  value: `Value ${index}`,
}))
type Row = (typeof data)[number]
const columns: WindowedTableColumn<Row>[] = [
  { key: 'id', header: 'ID', width: 64, getText: (row) => row.id },
  { key: 'value', header: 'Value', width: 96, getText: (row) => row.value },
]
const props: WindowedTableProps<Row> = {
  data,
  columns,
  getRowKey: (row) => row.id,
  rowHeight: 32,
  maxHeight: 240,
  accessibilityLabel: 'Orders',
}
const html = (extra: Partial<WindowedTableProps<Row>> = {}) =>
  renderToStaticMarkup(<WindowedTable {...props} {...extra} />)

test('Web retains every semantic row, exact columns and explicit header associations', () => {
  const result = html()
  assert.equal([...result.matchAll(/<tr>/g)].length, 1001)
  assert.equal([...result.matchAll(/<td /g)].length, 2000)
  assert.match(result, /<table aria-label="Orders" style="width:160px;table-layout:fixed;/)
  assert.match(result, /<colgroup><col style="width:64px"\/><col style="width:96px"\/><\/colgroup>/)
  assert.match(result, /max-height:240px;overflow:auto/)
  const headers = [...result.matchAll(/<th id="([^"]+)" scope="col"/g)].map((match) => match[1])
  assert.equal(headers.length, 2)
  const associations = [...result.matchAll(/<td headers="([^"]+)"/g)].map((match) => match[1])
  assert.deepEqual(
    associations,
    data.flatMap(() => headers),
  )
  assert.match(result, /Value 999/)
  assert.match(result, /height:32px;box-sizing:border-box;overflow:hidden/)
})

test('Web formats all rows once and decoration keeps the full accessible value', () => {
  const calls: string[] = []
  const result = html({
    columns: [
      {
        key: 'value',
        header: 'Value',
        width: 80,
        getText: (row) => {
          calls.push(row.id)
          return row.value
        },
        renderCell: () => <strong>Decorated</strong>,
      },
    ],
  })
  assert.deepEqual(
    calls,
    data.map((row) => row.id),
  )
  assert.match(result, /aria-label="Value 999"/)
  assert.equal([...result.matchAll(/aria-hidden="true"/g)].length, 1000)
  assert.equal([...result.matchAll(/<strong>Decorated<\/strong>/g)].length, 1000)
})

test('empty data still has a labeled header and a bounded viewport', () => {
  const result = html({ data: [] })
  assert.match(result, /max-height:32px/)
  assert.match(result, /<tbody><\/tbody>/)
  assert.equal([...result.matchAll(/<th /g)].length, 2)
})

test('invalid geometry and identity fail before rendering or formatting cells', () => {
  for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => html({ rowHeight: value }), /rowHeight must be finite and positive/)
    assert.throws(() => html({ maxHeight: value }), /maxHeight must be finite and positive/)
    assert.throws(
      () => html({ columns: [{ ...columns[0]!, width: value }] }),
      /column width must be/,
    )
  }
  assert.throws(() => html({ columns: [] }), /at least one column/)
  assert.throws(() => html({ columns: [columns[0]!, columns[0]!] }), /column keys/)
  assert.throws(() => html({ columns: [{ ...columns[0]!, key: '' }] }), /column keys/)
  assert.throws(
    () => html({ columns: columns.map((column) => ({ ...column, width: Number.MAX_VALUE })) }),
    /total width/,
  )
  let formatted = false
  assert.throws(
    () =>
      html({
        data: [data[0]!, data[0]!],
        columns: [
          {
            ...columns[0]!,
            getText: () => {
              formatted = true
              return ''
            },
          },
        ],
      }),
    /row keys/,
  )
  assert.equal(formatted, false)
  assert.throws(() => html({ getRowKey: () => '' }), /row keys/)
})
