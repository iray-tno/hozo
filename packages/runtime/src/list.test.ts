import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { HozoFlatList, HozoRefreshControl, HozoScrollView } from './list.ts'

test('ScrollView keeps its viewport and content styles separate', () => {
  const html = renderToStaticMarkup(
    createElement(
      HozoScrollView,
      {
        horizontal: true,
        showsHorizontalScrollIndicator: false,
        style: [{ height: 80 }, { width: 240 }],
        contentContainerStyle: [{ gap: 8 }, { paddingLeft: 12 }],
      },
      'content',
    ),
  )

  assert.match(html, /data-hozo-horizontal=""/)
  assert.match(html, /data-hozo-hide-scrollbar=""/)
  assert.match(html, /height:80px;width:240px/)
  assert.match(html, /gap:8px;padding-left:12px/)
})

test('FlatList renders data, stable keys, columns, and nested refresh intent', () => {
  const html = renderToStaticMarkup(
    createElement(HozoFlatList<{ id: string }>, {
      data: [{ id: 'a' }, { id: 'b' }],
      keyExtractor: (item) => item.id,
      renderItem: ({ item, index }) => `${index}:${item.id}`,
      numColumns: 2,
      refreshControl: createElement(HozoRefreshControl, {
        refreshing: true,
        onRefresh() {},
      }),
    }),
  )

  assert.match(html, /aria-busy="true"/)
  assert.match(html, /data-hozo-refresh-control=""/)
  assert.match(html, /grid-template-columns:repeat\(2, minmax\(0, 1fr\)\)/)
  assert.match(html, /data-hozo-list-index="0"[^>]*>0:a/)
  assert.match(html, /data-hozo-list-index="1"[^>]*>1:b/)
})

test('a thousand rows mount ten of them, and the rest is space', () => {
  // #385: the bridge accepted `initialNumToRender` and rendered every row
  // anyway, so a long feed was a long feed's worth of mounted subtrees.
  //
  // Asked of the server render, which is the one moment no viewport has
  // been measured -- `initialNumToRender` is the whole answer there, and a
  // crawler and `renderToStaticMarkup` both land on it.
  const data = Array.from({ length: 1000 }, (_, index) => ({ id: `row-${index}` }))
  const html = renderToStaticMarkup(
    createElement(HozoFlatList<{ id: string }>, {
      data,
      keyExtractor: (item) => item.id,
      renderItem: ({ item }) => item.id,
      estimatedItemSize: 100,
    }),
  )

  const mounted = html.match(/data-hozo-list-index=/g) ?? []
  assert.equal(mounted.length, 10, 'mounted rows')
  assert.match(html, /data-hozo-list-count="1000"/, 'the list still says how long it is')
  // The 990 rows that are not mounted, as space: 10 mounted above, so the
  // padding below is 990 x 100px.
  assert.match(html, /padding-bottom:99000px/)
  assert.doesNotMatch(html, /padding-top:[1-9]/, 'nothing is skipped at the top of a fresh list')
})

test('exact geometry from getItemLayout is used instead of an estimate', () => {
  // The shortcut React Native offers a caller who already knows. 40px rows
  // rather than the 100px default estimate, so the trailing space is
  // 990 x 40 and no measurement had to happen for it to be right.
  const data = Array.from({ length: 1000 }, (_, index) => ({ id: `row-${index}` }))
  const html = renderToStaticMarkup(
    createElement(HozoFlatList<{ id: string }>, {
      data,
      keyExtractor: (item) => item.id,
      renderItem: ({ item }) => item.id,
      getItemLayout: (_data, index) => ({ length: 40, offset: index * 40, index }),
    }),
  )
  assert.match(html, /padding-bottom:39600px/)
})

test('inverted mirrors the scroller and every row back', () => {
  // React Native's `inverted` puts row 0 at the bottom, and
  // `react-native-web` does it with a mirror transform rather than by
  // reversing anything. Layout, scroll offsets and measurement all stay in
  // list space, which is why nothing in the windowing has to know about it.
  const html = renderToStaticMarkup(
    createElement(HozoFlatList<{ id: string }>, {
      data: [{ id: 'a' }, { id: 'b' }],
      keyExtractor: (item) => item.id,
      renderItem: ({ item }) => item.id,
      inverted: true,
      ListHeaderComponent: 'header',
    }),
  )
  const mirrors = html.match(/transform:scaleY\(-1\)/g) ?? []
  // The scroller, the header, and one per row: mirroring the scroller
  // alone would leave every row's own contents upside down.
  assert.equal(mirrors.length, 4, `mirrors found: ${mirrors.length}`)
})

test('a horizontal list is windowed along its own axis', () => {
  const data = Array.from({ length: 500 }, (_, index) => ({ id: `row-${index}` }))
  const html = renderToStaticMarkup(
    createElement(HozoFlatList<{ id: string }>, {
      data,
      keyExtractor: (item) => item.id,
      renderItem: ({ item }) => item.id,
      horizontal: true,
      estimatedItemSize: 50,
      initialNumToRender: 4,
    }),
  )
  assert.match(html, /padding-right:24800px/, 'the unmounted rows are horizontal space')
  assert.doesNotMatch(html, /padding-bottom/)
  assert.equal((html.match(/data-hozo-list-index=/g) ?? []).length, 4)
})

test('columns are windowed as rows, not as items', () => {
  // A two-column grid scrolls by rows. Windowed by item, each edge would
  // mount half a row and measure a height no row has.
  const data = Array.from({ length: 100 }, (_, index) => ({ id: `row-${index}` }))
  const html = renderToStaticMarkup(
    createElement(HozoFlatList<{ id: string }>, {
      data,
      keyExtractor: (item) => item.id,
      renderItem: ({ item }) => item.id,
      numColumns: 2,
      initialNumToRender: 3,
    }),
  )
  assert.equal((html.match(/data-hozo-list-row=/g) ?? []).length, 3, 'rows mounted')
  assert.equal((html.match(/data-hozo-list-index=/g) ?? []).length, 6, 'items in those rows')
  assert.match(html, /grid-template-columns:repeat\(2, minmax\(0, 1fr\)\)/)
})

test('a windowed row still says how long the list really is', () => {
  // The one thing about virtualisation the Web can answer completely.
  // Without it a screen reader announces what is *mounted* -- "list, 3
  // items" for a thousand -- and has no way to know better, because the
  // rows that are not there cannot be counted.
  const data = Array.from({ length: 1000 }, (_, index) => ({ id: `row-${index}` }))
  const html = renderToStaticMarkup(
    createElement(HozoFlatList<{ id: string }>, {
      data,
      keyExtractor: (item) => item.id,
      renderItem: ({ item }) => item.id,
      initialNumToRender: 3,
    }),
  )
  assert.equal((html.match(/aria-setsize="1000"/g) ?? []).length, 3)
  assert.match(html, /aria-posinset="1"/)
  assert.match(html, /aria-posinset="3"/)
  assert.doesNotMatch(html, /aria-posinset="0"/, 'aria-posinset counts from one')
})

test('and the row wrapper does not stand between the list and its items', () => {
  // ARIA requires a `listitem` to be owned by a `list`. The wrapper exists
  // to be measured and to be the grid row, and windowing put it in the
  // middle of that relationship -- so it is removed from the accessibility
  // tree, which leaves the items where they were.
  const html = renderToStaticMarkup(
    createElement(HozoFlatList<{ id: string }>, {
      data: [{ id: 'a' }, { id: 'b' }],
      keyExtractor: (item) => item.id,
      renderItem: ({ item }) => item.id,
    }),
  )
  assert.match(html, /role="presentation" data-hozo-list-row="0"/)
  // And the only thing between them is that wrapper: a `list` whose child
  // is a `listitem` two levels down through anything *else* would be the
  // same defect again.
  assert.match(html, /role="list"[^>]*>\s*<div role="presentation"[^>]*>\s*<div role="listitem"/)
})
