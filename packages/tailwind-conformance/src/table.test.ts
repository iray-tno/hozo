// `Table` (#144): the table elements on the Web, and on React Native a table
// that sizes each column from every cell in it -- the browser's automatic
// layout -- and names each data cell with its column for a reader. The
// Native half drives `onLayout` by hand against the RN stub; the widths are
// the ones the test reports, not a device's.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { loadNativeModule, type Tree } from './native-render.ts'
import { renderWeb } from './render.ts'

const require = createRequire(import.meta.url)
const react = require('react')
const renderer = require('react-test-renderer')
const stub = require('react-native')
const { compile } = require('@hozo/compiler') as {
  compile: (source: string, filename?: string) => { jsx: string; css: string }[]
}
const flat = (node: { props: Record<string, unknown> } | undefined) =>
  stub.StyleSheet.flatten([node?.props.style].flat(Infinity))

const source = (tableClass: string, extra = '') => `
  import { Table, TableCaption, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@hozo/core'
  export function C({ rows }) {
    return (
      <Table className="${tableClass}"${extra}>
        <TableCaption>Orders</TableCaption>
        <TableHeader>
          <TableRow><TableHead>Item</TableHead><TableHead>Price</TableHead></TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.name}>
              <TableHead scope="row">{row.name}</TableHead>
              <TableCell className="text-right font-bold">{row.price}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )
  }`

const ROWS = [
  { name: 'Tea', price: '$4' },
  { name: 'Shortbread', price: '$12' },
]

test('on the Web: the table elements, a column header scoped to its column', () => {
  const [out] = compile(source('w-full text-sm'), 'C.tsx')
  assert.ok(out, 'the Web compiler lowered nothing')
  const [{ html }] = renderWeb([{ name: 'C', jsx: out.jsx }], { rows: ROWS })
  assert.match(html, /^<table class="hozo-0"><caption>Orders<\/caption><thead><tr>/, html)
  assert.match(html, /<th scope="col">Item<\/th><th scope="col">Price<\/th>/, html)
  // A row header keeps the scope its author gave it.
  assert.match(html, /<th scope="row">Shortbread<\/th><td class="hozo-\d+">\$12<\/td>/, html)
})

function mount(tableClass: string, extra = '', rows = ROWS) {
  const { C } = loadNativeModule(source(tableClass, extra))
  let root: ReturnType<typeof renderer.create> | undefined
  renderer.act(() => {
    root = renderer.create(react.createElement(C, { rows }))
  })
  return { root, C }
}

const layout = (node: Tree, width: number) =>
  renderer.act(() =>
    (node.props.onLayout as (event: unknown) => void)({
      nativeEvent: { layout: { x: 0, y: 0, width, height: 20 } },
    }),
  )
const cells = (root: ReturnType<typeof renderer.create>) =>
  root.root.findAll(
    (node: Tree) => node.type === 'View' && node.props.accessibilityCollectionItem !== undefined,
  )
const table = (root: ReturnType<typeof renderer.create>) =>
  root.root.findAll((node: Tree) => node.type === 'View' && node.props.onLayout !== undefined)[0]

/** Reports natural widths: Item 30, Price 40, Tea 25, $4 15, Shortbread 80, $12 22. */
function measure(root: ReturnType<typeof renderer.create>, available: number) {
  layout(table(root), available)
  const natural = [30, 40, 25, 15, 80, 22]
  cells(root).forEach((cell: Tree, index: number) => {
    layout(cell, natural[index] as number)
  })
}

test('on Native: hidden until measured, then every column as wide as its widest cell', () => {
  const { root } = mount('text-sm')
  const tableView = () =>
    root.root.findAll((node: Tree) => node.type === 'View' && node.props.testID === undefined)[1]
  assert.equal(flat(tableView()).opacity, 0, 'the unmeasured frame is shown')
  measure(root, 1000)
  assert.equal(flat(tableView()).opacity, undefined)
  const widths = cells(root).map((cell: Tree) => flat(cell).width)
  // Column 0 is the widest of Item, Tea, Shortbread; column 1 of Price, $4, $12.
  assert.deepEqual(widths, [80, 40, 80, 40, 80, 40])
  renderer.act(() => root.unmount())
})

test('on Native: w-full shares the room left over, in proportion', () => {
  const { root } = mount('w-full')
  measure(root, 240)
  const [first, second] = cells(root).map((cell: Tree) => flat(cell).width)
  assert.equal(first + second, 240)
  assert.equal(first / second, 80 / 40)
  renderer.act(() => root.unmount())
})

test('on Native: too wide shrinks in proportion, unless the table scrolls', () => {
  const narrow = mount('')
  measure(narrow.root, 60)
  const [a, b] = cells(narrow.root).map((cell: Tree) => flat(cell).width)
  assert.equal(a + b, 60)
  renderer.act(() => narrow.root.unmount())

  const scrolling = mount('', ' scrollable')
  measure(scrolling.root, 60)
  const [c, d] = cells(scrolling.root).map((cell: Tree) => flat(cell).width)
  assert.deepEqual([c, d], [80, 40])
  assert.equal(scrolling.root.root.findAll((node: Tree) => node.type === 'ScrollView').length, 1)
  renderer.act(() => scrolling.root.unmount())
})

test('on Native: a data cell is named with its column, and every cell knows its place', () => {
  const { root } = mount('')
  measure(root, 1000)
  const all = cells(root)
  const price = all[5]
  assert.equal(price.props.accessibilityLabel, 'Price, $12')
  assert.deepEqual(price.props.accessibilityCollectionItem, {
    rowIndex: 2,
    rowSpan: 1,
    columnIndex: 1,
    columnSpan: 1,
    heading: false,
  })
  // A column header is read as itself and heads its column -- through its
  // collection item, not a heading role (#804).
  assert.equal(all[1].props.accessibilityRole, undefined)
  assert.equal(all[1].props.accessibilityLabel, undefined)
  assert.equal(all[1].props.accessibilityCollectionItem.heading, true)
  // A row header heads its row, so it is not a column heading.
  assert.equal(all[4].props.accessibilityCollectionItem.heading, false)
  // The cell's text styles reach its text.
  const [text] = price.findAll((node: Tree) => node.type === 'Text')
  assert.equal(flat(text).textAlign, 'right')
  assert.equal(flat(text).fontWeight, '700')
  renderer.act(() => root.unmount())
})

test('on Native: a change to a cell measures again', () => {
  const { root, C } = mount('')
  measure(root, 1000)
  renderer.act(() =>
    root.update(react.createElement(C, { rows: [...ROWS, { name: 'Scone', price: '$3' }] })),
  )
  const hidden = root.root.findAll((node: Tree) => node.type === 'View' && flat(node).opacity === 0)
  assert.equal(hidden.length, 1, 'a new row was drawn before it was measured')
  assert.ok(cells(root).every((cell: Tree) => flat(cell).width === undefined))
  renderer.act(() => root.unmount())
})

test('uncompiled, the public names are the same table', async () => {
  const semantics = (await import('@hozo/semantics')) as Record<string, unknown>
  const e = react.createElement
  let root: ReturnType<typeof renderer.create> | undefined
  renderer.act(() => {
    root = renderer.create(
      e(
        semantics.Table,
        null,
        e(
          semantics.TableHeader,
          null,
          e(semantics.TableRow, null, e(semantics.TableHead, null, 'Price')),
        ),
        e(
          semantics.TableBody,
          null,
          e(semantics.TableRow, null, e(semantics.TableCell, null, '$4')),
        ),
      ),
    )
  })
  const found = cells(root)
  assert.equal(found[1].props.accessibilityLabel, 'Price, $4')
  assert.equal(found[1].props.accessibilityCollectionItem.rowIndex, 1)
  renderer.act(() => root.unmount())
})
