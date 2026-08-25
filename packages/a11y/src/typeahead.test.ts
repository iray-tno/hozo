import assert from 'node:assert/strict'
import { test } from 'node:test'

import { isTypeaheadKey, nextSearch, searchIndex } from './typeahead.ts'

const labels = ['Cut', 'Copy', 'Paste', 'Select all', 'Save', 'Send']

test('a letter jumps to the next item starting with it', () => {
  assert.equal(searchIndex('p', { labels, active: 0 }), 2)
  assert.equal(searchIndex('co', { labels, active: 0 }), 1)
})

test('the search wraps rather than stopping at the end', () => {
  assert.equal(searchIndex('c', { labels, active: 4 }), 0)
})

test('the same letter again walks to the next match', () => {
  // `sss` is "the third item starting with s", not an item called sss --
  // which none is. Without this the third press finds nothing and focus
  // stops moving, and the list looks broken.
  assert.equal(searchIndex('s', { labels, active: 0 }), 3)
  assert.equal(searchIndex('ss', { labels, active: 3 }), 4)
  assert.equal(searchIndex('sss', { labels, active: 4 }), 5)
  assert.equal(searchIndex('ssss', { labels, active: 5 }), 3)
})

test('a real search starts from the active item, not after it', () => {
  // Typing the name of the item you are already on does not move you off
  // it, which is what makes correcting a mistyped search work.
  assert.equal(searchIndex('paste', { labels, active: 2 }), 2)
})

test('no match moves nothing', () => {
  assert.equal(searchIndex('zz', { labels, active: 0 }), null)
  assert.equal(searchIndex('', { labels, active: 0 }), null)
  assert.equal(searchIndex('a', { labels: [], active: 0 }), null)
})

test('a disabled item is not a match', () => {
  assert.equal(searchIndex('c', { labels, active: 4, disabled: [0] }), 1)
})

test('matching ignores case and leading space', () => {
  assert.equal(searchIndex('c', { labels: ['  Copy'], active: 0 }), 0)
  assert.equal(searchIndex('CO', { labels, active: 0 }), null, 'the caller lowercases as it types')
  assert.equal(searchIndex('co', { labels: ['COPY'], active: 0 }), 0)
})

test('a pause starts a new search', () => {
  // Coming back to a list later and pressing `s` searches for `s`, not
  // for whatever was typed an hour ago plus `s`.
  assert.equal(nextSearch('co', 'p', 50), 'cop')
  assert.equal(nextSearch('co', 'p', 5000), 'p')
})

test('space types only when a search is already going', () => {
  // Space activates the focused item in a menu. Treating it as a
  // character means the menu cannot be used from the keyboard at all --
  // but a space inside "New Folder" is a real one.
  assert.equal(isTypeaheadKey(' ', false), false)
  assert.equal(isTypeaheadKey(' ', true), true)
  assert.equal(isTypeaheadKey('a', false), true)
  assert.equal(isTypeaheadKey('Enter', false), false)
  assert.equal(isTypeaheadKey('ArrowDown', true), false)
})
