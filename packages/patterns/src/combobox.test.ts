import assert from 'node:assert/strict'
import { test } from 'node:test'

import { activeAfter, filterOptions, inlineCompletion } from './combobox-rules.ts'

const labels = ['Madrid', 'Manchester', 'Birmingham', 'Milan']

test('an empty query shows everything', () => {
  assert.deepEqual(filterOptions({ query: '', labels }), [0, 1, 2, 3])
  assert.deepEqual(filterOptions({ query: '   ', labels }), [0, 1, 2, 3])
})

test('starts and contains are different products', () => {
  assert.deepEqual(filterOptions({ query: 'ma', labels }), [0, 1])
  assert.deepEqual(filterOptions({ query: 'ham', labels }), [])
  assert.deepEqual(filterOptions({ query: 'ham', labels, match: 'contains' }), [2])
})

test('matching ignores case, and the order is the list order', () => {
  assert.deepEqual(filterOptions({ query: 'MI', labels }), [3])
  assert.deepEqual(filterOptions({ query: 'm', labels }), [0, 1, 3])
})

test('completion selects the part the user did not type', () => {
  assert.deepEqual(inlineCompletion('ma', 'Madrid', false), {
    value: 'madrid',
    selectionStart: 2,
    selectionEnd: 6,
  })
})

test('completion keeps the letters the user can see themselves having typed', () => {
  assert.equal(inlineCompletion('mad', 'Madrid', false)?.value, 'madrid')
  assert.equal(inlineCompletion('MAD', 'Madrid', false)?.value, 'MADrid')
})

test('completion does not fire while deleting', () => {
  assert.equal(inlineCompletion('madri', 'Madrid', true), null)
})

test('completion needs something to complete', () => {
  assert.equal(inlineCompletion('', 'Madrid', false), null)
  assert.equal(inlineCompletion('ma', undefined, false), null)
  assert.equal(inlineCompletion('xyz', 'Madrid', false), null, 'not a prefix')
  assert.equal(inlineCompletion('Madrid', 'Madrid', false), null, 'nothing left to add')
})

test('arrow navigation over a filtered list stops at the ends and does not wrap', () => {
  assert.equal(activeAfter('ArrowDown', null, 4), 0)
  assert.equal(activeAfter('ArrowUp', null, 4), 3)

  assert.equal(activeAfter('ArrowDown', 0, 4), 1)
  assert.equal(activeAfter('ArrowDown', 3, 4), 3, 'clamped at end')
  assert.equal(activeAfter('ArrowUp', 3, 4), 2)
  assert.equal(activeAfter('ArrowUp', 0, 4), 0, 'clamped at start')
})

test('an empty list has no active option', () => {
  assert.equal(activeAfter('ArrowDown', null, 0), null)
  assert.equal(activeAfter('ArrowUp', null, 0), null)
})
