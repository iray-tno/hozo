import assert from 'node:assert/strict'
import { test } from 'node:test'

import { horizontalMove, type TreeNode, visibleRows } from './tree-rules.ts'

const tree: TreeNode[] = [
  {
    id: 'src',
    label: 'src',
    children: [
      { id: 'index', label: 'index.ts' },
      { id: 'lib', label: 'lib', children: [{ id: 'util', label: 'util.ts' }] },
    ],
  },
  { id: 'readme', label: 'README.md' },
]

const ids = (expanded: string[]) => visibleRows(tree, new Set(expanded)).map((row) => row.id)

test('a collapsed branch shows itself and nothing under it', () => {
  assert.deepEqual(ids([]), ['src', 'readme'])
})

test('the rows are what is on screen, in the order they are drawn', () => {
  assert.deepEqual(ids(['src']), ['src', 'index', 'lib', 'readme'])
  assert.deepEqual(ids(['src', 'lib']), ['src', 'index', 'lib', 'util', 'readme'])
  assert.deepEqual(ids(['lib']), ['src', 'readme'])
})

test('down from the last child goes to the next branch, not to a sibling', () => {
  const rows = ids(['src', 'lib'])
  assert.equal(rows[rows.indexOf('util') + 1], 'readme')
})

test('each row carries its depth and its place among its siblings', () => {
  const rows = visibleRows(tree, new Set(['src', 'lib']))
  const util = rows.find((row) => row.id === 'util')
  assert.deepEqual(
    { level: util?.level, position: util?.position, setSize: util?.setSize },
    { level: 3, position: 1, setSize: 1 },
  )
  const readme = rows.find((row) => row.id === 'readme')
  assert.deepEqual(
    { position: readme?.position, setSize: readme?.setSize },
    { position: 2, setSize: 2 },
  )
})

test('only a branch says whether it is open', () => {
  const rows = visibleRows(tree, new Set(['src']))
  assert.equal(rows.find((row) => row.id === 'src')?.branch, true)
  assert.equal(rows.find((row) => row.id === 'index')?.branch, false)
})

test('right opens a closed branch and steps into an open one', () => {
  const closed = visibleRows(tree, new Set())
  assert.deepEqual(horizontalMove('ArrowRight', closed, 0), { kind: 'expand', id: 'src' })
  const open = visibleRows(tree, new Set(['src']))
  assert.deepEqual(horizontalMove('ArrowRight', open, 0), { kind: 'focus', index: 1 })
})

test('left closes an open branch and steps out of anything else', () => {
  const open = visibleRows(tree, new Set(['src']))
  assert.deepEqual(horizontalMove('ArrowLeft', open, 0), { kind: 'collapse', id: 'src' })
  assert.deepEqual(horizontalMove('ArrowLeft', open, 2), { kind: 'focus', index: 0 })
})

test('a key with nowhere to go is given back to the page', () => {
  const open = visibleRows(tree, new Set(['src']))
  assert.equal(horizontalMove('ArrowRight', open, 1), null, 'a leaf')
  assert.equal(horizontalMove('ArrowLeft', open, 3), null, 'a top-level row')
})

test('the arrows swap when the tree is drawn right to left', () => {
  const closed = visibleRows(tree, new Set())
  assert.deepEqual(horizontalMove('ArrowLeft', closed, 0, true), { kind: 'expand', id: 'src' })
  const open = visibleRows(tree, new Set(['src']))
  assert.deepEqual(horizontalMove('ArrowRight', open, 0, true), { kind: 'collapse', id: 'src' })
})
