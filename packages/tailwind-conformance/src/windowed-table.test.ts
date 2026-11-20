// The RN host is a stub: this proves the component's contract with FlatList,
// not FlatList's own recycling or the device's accessibility announcements.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { loadNativeModule } from './native-render.ts'

const require = createRequire(import.meta.url)
const { createElement, cloneElement, Fragment, useEffect } = require('react')
const renderer = require('react-test-renderer')
const { WindowedTable } = require('@hozo/patterns')
const stub = require('react-native')

const data = Array.from({ length: 1000 }, (_, index) => ({
  id: `row-${index}`,
  text: `Value ${index}`,
}))
const getRowKey = (row: (typeof data)[number]) => row.id
const formatted: string[] = []
const decorated: string[] = []
let mounts = 0
function Decoration({ text }: { text: string }) {
  useEffect(() => {
    mounts++
  }, [])
  return createElement(stub.Text, null, text)
}
const columns = [
  { key: 'id', header: 'ID', width: 64, getText: getRowKey },
  {
    key: 'text',
    header: 'Value',
    width: 96,
    getText: (row: (typeof data)[number]) => {
      formatted.push(row.id)
      return row.text
    },
    renderCell: (text: string, row: (typeof data)[number]) => {
      decorated.push(row.id)
      return createElement(Decoration, { text })
    },
  },
]

test('Native leaves cell work to the list and retains exact geometry, labels and absolute positions', (t) => {
  const platform = stub.Platform.OS
  t.after(() => {
    stub.Platform.OS = platform
  })
  stub.Platform.OS = 'android'
  formatted.length = 0
  decorated.length = 0
  mounts = 0
  const props = {
    data,
    columns,
    getRowKey,
    rowHeight: 32,
    maxHeight: 240,
    accessibilityLabel: 'Orders',
  }
  let root: ReturnType<typeof renderer.create>
  let slice: ReturnType<typeof renderer.create>
  renderer.act(() => {
    root = renderer.create(createElement(WindowedTable, props))
  })
  const list = () => root.root.findByType('FlatList').props
  assert.deepEqual(formatted, [], 'constructing the list must not format offscreen values')
  assert.deepEqual(decorated, [], 'constructing the list must not render offscreen decoration')
  assert.equal(list().accessibilityLabel, 'Orders')
  assert.equal(list().accessibilityCollection, undefined, '#525 must remain avoided')
  assert.equal(list().initialNumToRender, 8)
  assert.equal(list().windowSize, 3)
  assert.equal(list().removeClippedSubviews, false)
  assert.deepEqual(list().getItemLayout(data, 999), { length: 32, offset: 32000, index: 999 })
  assert.equal(list().keyExtractor(data[999], 999), 'row-999')
  const scroll = root.root.findByType('ScrollView')
  assert.equal(scroll.props.horizontal, true)
  assert.deepEqual(scroll.props.contentContainerStyle, { width: 160, height: 240 })

  const window = (indices: number[]) =>
    createElement(
      Fragment,
      null,
      list().ListHeaderComponent,
      ...indices.map((index) =>
        cloneElement(list().renderItem({ item: list().data[index], index }), {
          key: list().keyExtractor(list().data[index], index),
        }),
      ),
    )
  renderer.act(() => {
    slice = renderer.create(window([0, 1]))
  })
  assert.deepEqual(formatted, ['row-0', 'row-1'])
  assert.deepEqual(decorated, formatted)
  const cells = () =>
    slice.root.findAll(
      (node: { type: string; props: Record<string, unknown> }) =>
        node.type === 'View' && node.props.accessible === true,
    )
  assert.deepEqual(
    cells().map(
      (cell: { props: Record<string, unknown> }) => stub.StyleSheet.flatten(cell.props.style).width,
    ),
    [64, 96, 64, 96, 64, 96],
  )
  assert.deepEqual(
    cells().map((cell: { props: Record<string, unknown> }) => cell.props.accessibilityLabel),
    ['ID', 'Value', 'ID, row-0', 'Value, Value 0', 'ID, row-1', 'Value, Value 1'],
  )
  assert.deepEqual(cells()[2].findByType('Text').children, ['row-0'])
  assert.deepEqual(cells()[5].props.accessibilityCollectionItem, {
    rowIndex: 2,
    columnIndex: 1,
    rowSpan: 1,
    columnSpan: 1,
    heading: false,
  })
  assert.equal(cells()[1].props.accessibilityCollectionItem.heading, true)
  assert.equal(
    slice.root.findAll(
      (node: { props: Record<string, unknown> | null }) =>
        typeof node.props?.onLayout === 'function',
    ).length,
    0,
    'declared widths need no natural-width probes',
  )

  renderer.act(() => {
    slice.update(window([999]))
  })
  assert.equal(cells()[3].props.accessibilityLabel, 'Value, Value 999')
  assert.equal(cells()[3].props.accessibilityCollectionItem.rowIndex, 1000)
  renderer.act(() => {
    slice.update(window([0, 1]))
  })
  assert.equal(cells()[3].props.accessibilityLabel, 'Value, Value 0')
  const before = mounts
  const reordered = [data[1], data[0], ...data.slice(2)]
  renderer.act(() => {
    root.update(createElement(WindowedTable, { ...props, data: reordered }))
  })
  renderer.act(() => {
    slice.update(window([0, 1]))
  })
  assert.equal(mounts, before, 'reordering preserves the keyed row and decoration owners')
  assert.equal(cells()[3].props.accessibilityLabel, 'Value, Value 1')
  assert.equal(cells()[3].props.accessibilityCollectionItem.rowIndex, 1)
  assert.equal(cells()[5].props.accessibilityCollectionItem.rowIndex, 2)

  const appended = [...reordered, { id: 'row-1000', text: 'Appended value' }]
  renderer.act(() => {
    root.update(createElement(WindowedTable, { ...props, data: appended }))
  })
  renderer.act(() => {
    slice.update(window([1000]))
  })
  assert.equal(list().keyExtractor(appended[1000], 1000), 'row-1000')
  assert.equal(cells()[3].props.accessibilityLabel, 'Value, Appended value')
  assert.equal(cells()[3].props.accessibilityCollectionItem.rowIndex, 1001)

  const reversedColumns = [...columns].reverse()
  renderer.act(() => {
    root.update(
      createElement(WindowedTable, { ...props, data: appended, columns: reversedColumns }),
    )
  })
  renderer.act(() => {
    slice.update(window([1000]))
  })
  assert.deepEqual(
    cells().map((cell: { props: Record<string, unknown> }) => cell.props.style.width),
    [96, 64, 96, 64],
  )
  assert.equal(cells()[2].props.accessibilityLabel, 'Value, Appended value')
  assert.equal(cells()[2].props.accessibilityCollectionItem.columnIndex, 0)

  let wrapper: ReturnType<typeof renderer.create>
  renderer.act(() => {
    wrapper = renderer.create(
      createElement(list().CellRendererComponent, {
        index: 10,
        item: data[10],
        cellKey: 'row-10',
        style: { height: 32 },
        onLayout: () => {},
        onFocusCapture: () => {},
        children: 'row',
      }),
    )
  })
  assert.equal(
    wrapper.toJSON().props.accessibilityCollectionItem,
    undefined,
    'the row wrapper must not add a conflicting 1D position',
  )
  assert.equal(typeof wrapper.toJSON().props.onLayout, 'function')
  assert.equal(typeof wrapper.toJSON().props.onFocusCapture, 'function')
  renderer.act(() => {
    wrapper.unmount()
    slice.unmount()
    root.unmount()
  })
})

test('the compiled core facade keeps the Native implementation and iOS full-value labels', (t) => {
  const platform = stub.Platform.OS
  t.after(() => {
    stub.Platform.OS = platform
  })
  stub.Platform.OS = 'ios'
  const { C } = loadNativeModule(`
    import { View, WindowedTable } from '@hozo/core'
    export function C(props) { return <View><WindowedTable {...props} /></View> }
  `)
  let root: ReturnType<typeof renderer.create>
  let slice: ReturnType<typeof renderer.create>
  const props = {
    data: [data[0]],
    columns: [columns[0], { ...columns[1], renderCell: () => 'Decorated string' }],
    getRowKey,
    rowHeight: 64,
    maxHeight: 256,
    accessibilityLabel: 'Orders',
  }
  renderer.act(() => {
    root = renderer.create(createElement(C, props))
  })
  const list = root.root.findByType('FlatList').props
  assert.equal(list.style.height, 128, 'the header is included in the viewport height')
  renderer.act(() => {
    slice = renderer.create(list.renderItem({ item: data[0], index: 0 }))
  })
  const cells = slice.root.findAll(
    (node: { type: string; props: Record<string, unknown> }) =>
      node.type === 'View' && node.props.accessible === true,
  )
  assert.deepEqual(
    cells.map((cell: { props: Record<string, unknown> }) => cell.props.accessibilityLabel),
    ['ID, row-0', 'Value, Value 0'],
  )
  for (const cell of cells) {
    assert.equal(cell.props.style.height, 64)
    assert.equal(cell.props.accessibilityCollectionItem, undefined)
  }
  assert.deepEqual(cells[1].findByType('Text').children, ['Decorated string'])
  assert.equal(list.accessibilityCollection, undefined)
  renderer.act(() => {
    slice.unmount()
    root.unmount()
  })
})
