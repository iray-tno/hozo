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
