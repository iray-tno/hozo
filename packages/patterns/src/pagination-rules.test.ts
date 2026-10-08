import assert from 'node:assert/strict'
import { test } from 'node:test'
import { type PaginationItem, paginationItems } from './pagination-rules.ts'

const show = (items: PaginationItem[]) =>
  items.map((item) => (item.type === 'page' ? String(item.page) : '…')).join(' ')

test('the shape the RFC draws: the ends, the neighbours, an ellipsis for each gap', () => {
  assert.equal(show(paginationItems({ page: 5, pageCount: 20 })), '1 … 4 5 6 … 20')
})

test('near either end, the ellipsis on that side gives way to pages', () => {
  assert.equal(show(paginationItems({ page: 1, pageCount: 20 })), '1 2 3 4 5 … 20')
  assert.equal(show(paginationItems({ page: 4, pageCount: 20 })), '1 2 3 4 5 … 20')
  assert.equal(show(paginationItems({ page: 20, pageCount: 20 })), '1 … 16 17 18 19 20')
})

test('the count of controls does not change as the current page moves', () => {
  const lengths = new Set(
    Array.from(
      { length: 20 },
      (_, index) => paginationItems({ page: index + 1, pageCount: 20 }).length,
    ),
  )
  assert.deepEqual([...lengths], [7])
})

test('an ellipsis never hides a single page; that page is shown instead', () => {
  assert.equal(show(paginationItems({ page: 1, pageCount: 7 })), '1 2 3 4 5 6 7')
  assert.equal(show(paginationItems({ page: 4, pageCount: 7 })), '1 2 3 4 5 6 7')
})

test('few pages are all shown', () => {
  assert.equal(show(paginationItems({ page: 2, pageCount: 3 })), '1 2 3')
  assert.equal(show(paginationItems({ page: 1, pageCount: 1 })), '1')
  assert.deepEqual(paginationItems({ page: 1, pageCount: 0 }), [])
})

test('siblings and boundaries widen what is shown', () => {
  assert.equal(
    show(paginationItems({ page: 10, pageCount: 20, siblingCount: 2 })),
    '1 … 8 9 10 11 12 … 20',
  )
  assert.equal(
    show(paginationItems({ page: 10, pageCount: 20, boundaryCount: 2 })),
    '1 2 … 9 10 11 … 19 20',
  )
})

test('a page outside the range is read as the nearest end', () => {
  assert.equal(
    show(paginationItems({ page: 99, pageCount: 20 })),
    show(paginationItems({ page: 20, pageCount: 20 })),
  )
  assert.equal(
    show(paginationItems({ page: -3, pageCount: 20 })),
    show(paginationItems({ page: 1, pageCount: 20 })),
  )
})
