// What makes two renders of a list the same list.
//
// `Listbox` and `RadioGroup` select by value and used to render by
// position, so a reorder that kept the selection handed React the same
// keys holding different content. React updates in place, which is what
// those keys asked for: the props follow and the DOM node does not, and
// browser focus is on the node.
//
// The rule is the testable part. Whether the browser then keeps focus on
// the right element is a browser's behaviour, not this function's, and
// `react-test-renderer` drops keys from its output -- so this pins the
// identity and says so rather than pretending to check the effect.

import assert from 'node:assert/strict'
import test from 'node:test'

import { optionKey } from './option-key.ts'

const keys = (options: readonly { value: unknown; id?: string }[]) =>
  options.map((option, at) => optionKey(option.value, option.id, at))

test('an option keeps its key when the list is reordered', () => {
  const france = { value: 'fr' }
  const germany = { value: 'de' }
  const spain = { value: 'es' }
  const before = keys([france, germany, spain])
  const after = keys([spain, france, germany])
  assert.equal(after[1], before[0], 'France changed identity by moving')
  assert.equal(after[2], before[1])
  assert.equal(after[0], before[2])
})

test('removing one does not renumber the rest', () => {
  // The case that reads as a bug rather than a shuffle: delete the first
  // row and every row below it used to become the row above it.
  const options = [{ value: 'a' }, { value: 'b' }, { value: 'c' }]
  assert.deepEqual(keys(options.slice(1)), keys(options).slice(1))
})

test('a number and a string that look alike are different options', () => {
  // They select differently -- `chosen.includes(1)` is not
  // `chosen.includes('1')` -- so they are not the same option, and one
  // key for both would have React reuse a node across the two.
  assert.notEqual(optionKey(1, undefined, 0), optionKey('1', undefined, 1))
})

test('an id wins, for a value that has no string of its own', () => {
  const first = { value: { code: 'fr' }, id: 'france' }
  const second = { value: { code: 'de' }, id: 'germany' }
  assert.deepEqual(keys([first, second]), ['france', 'germany'])
  assert.deepEqual(keys([second, first]), ['germany', 'france'])
})

test('a value with no string form falls back to where it is', () => {
  // No worse than before this existed, and the only honest answer: two
  // objects with the same contents are still two options, and nothing
  // here can tell which one moved.
  assert.deepEqual(keys([{ value: { a: 1 } }, { value: { a: 2 } }]), ['at:0', 'at:1'])
})

test('keys are unique across a list of distinct values', () => {
  const options = [{ value: 'a' }, { value: 1 }, { value: true }, { value: 'b' }]
  assert.equal(new Set(keys(options)).size, options.length)
})
