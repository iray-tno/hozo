import assert from 'node:assert/strict'
import { test } from 'node:test'

import { activeAfter, filterOptions, inlineCompletion } from './combobox.ts'

const labels = ['Madrid', 'Manchester', 'Birmingham', 'Milan']

test('an empty query shows everything', () => {
  // A combobox that shows nothing until a key is pressed has hidden the
  // fact that it has options at all -- that is a search box, not a picker.
  assert.deepEqual(filterOptions({ query: '', labels }), [0, 1, 2, 3])
  assert.deepEqual(filterOptions({ query: '   ', labels }), [0, 1, 2, 3])
})

test('starts and contains are different products', () => {
  assert.deepEqual(filterOptions({ query: 'ma', labels }), [0, 1])
  // `contains` finds the label whose distinguishing part is not first:
  // nothing starts with "ham" and Birmingham ends with it.
  assert.deepEqual(filterOptions({ query: 'ham', labels }), [])
  assert.deepEqual(filterOptions({ query: 'ham', labels, match: 'contains' }), [2])
})

test('matching ignores case, and the order is the list order', () => {
  assert.deepEqual(filterOptions({ query: 'MI', labels }), [3])
  assert.deepEqual(filterOptions({ query: 'm', labels }), [0, 1, 3])
})

test('completion selects the part the user did not type', () => {
  // So the next keystroke replaces it. Without the selection, typing
  // `m`,`a`,`n` into a list with Madrid gives "Madridn".
  assert.deepEqual(inlineCompletion('ma', 'Madrid', false), {
    value: 'madrid',
    selectionStart: 2,
    selectionEnd: 6,
  })
})

test('completion keeps the letters the user can see themselves having typed', () => {
  // Their casing up to where they stopped, the label's after it.
  // Rewriting "ma" to "Ma" under the cursor is the field arguing with the
  // keyboard.
  assert.equal(inlineCompletion('mad', 'Madrid', false)?.value, 'madrid')
  assert.equal(inlineCompletion('MAD', 'Madrid', false)?.value, 'MADrid')
})

test('completion does not fire while deleting', () => {
  // The reason this is a function and not two lines at the call site.
  // Backspace on "Madrid" leaves "Madri", and completing that puts
  // "Madrid" straight back: the field cannot be cleared, one character at
  // a time, and it looks like the keyboard is broken.
  assert.equal(inlineCompletion('madri', 'Madrid', true), null)
})

test('completion needs something to complete', () => {
  assert.equal(inlineCompletion('', 'Madrid', false), null)
  assert.equal(inlineCompletion('ma', undefined, false), null)
  assert.equal(inlineCompletion('xyz', 'Madrid', false), null, 'not a prefix')
  assert.equal(inlineCompletion('Madrid', 'Madrid', false), null, 'nothing left to add')
})

test('an open list with nothing active is a real state', () => {
  // And the one a combobox is in every time it opens, which is why this
  // is not `roving.ts`: a roving group always has an active item.
  assert.equal(activeAfter('ArrowDown', null, 4), 0)
  assert.equal(activeAfter('ArrowUp', null, 4), 3)
})

test('the list does not wrap', () => {
  // The ends joining up saves a walk in a roving group. Here the list is
  // a set the user is narrowing, and arriving back at the top after the
  // last item reads as the list having reset.
  assert.equal(activeAfter('ArrowDown', 3, 4), 3)
  assert.equal(activeAfter('ArrowUp', 0, 4), 0)
  assert.equal(activeAfter('ArrowDown', 1, 4), 2)
})

test('an empty list has nothing to be active', () => {
  assert.equal(activeAfter('ArrowDown', null, 0), null)
})
