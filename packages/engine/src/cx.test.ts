import assert from 'node:assert/strict'
import test from 'node:test'
import { cx } from './cx.ts'

test('cx joins the truthy class strings, as clsx does for strings', () => {
  const active = false
  assert.equal(
    cx('p-4 hover:bg-blue-500', active && 'ring-2', undefined, null, '', 'mt-2'),
    'p-4 hover:bg-blue-500 mt-2',
  )
  assert.equal(cx(), '')
  assert.equal(cx(undefined), '')
})
