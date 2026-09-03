import assert from 'node:assert/strict'
import test from 'node:test'
import {
  initialFocusIndex,
  isTypeaheadKey,
  nextIndex,
  nextSearch,
  searchIndex,
  shouldRestoreFocus,
  tabStops,
} from './index.ts'

test('initialFocusIndex: prioritizes explicit autofocus over document order', () => {
  const candidates = [
    { focusable: true, autofocus: false },
    { focusable: true, autofocus: true },
    { focusable: true, autofocus: false },
  ]
  assert.equal(initialFocusIndex(candidates), 1)
})

test('initialFocusIndex: falls back to first focusable, then null for container fallback', () => {
  const candidates = [{ focusable: false }, { focusable: true }, { focusable: true }]
  assert.equal(initialFocusIndex(candidates), 1)
  assert.equal(initialFocusIndex([{ focusable: false }]), null)
})

test('shouldRestoreFocus: restores only if opener is focusable', () => {
  assert.equal(shouldRestoreFocus({ focusable: true }), true)
  assert.equal(shouldRestoreFocus({ focusable: false }), false)
  assert.equal(shouldRestoreFocus(null), false)
  assert.equal(shouldRestoreFocus(undefined), false)
})

test('RovingFocus: arrow navigation and wrap-around', () => {
  const opts = { count: 3, active: 0, orientation: 'horizontal' as const, wrap: true }
  assert.equal(nextIndex('ArrowRight', opts), 1)
  assert.equal(nextIndex('ArrowLeft', opts), 2) // wraps to end
})

test('RovingFocus: skips disabled items without infinite loop', () => {
  const opts = {
    count: 3,
    active: 0,
    disabled: [1],
    orientation: 'horizontal' as const,
  }
  // Moves from 0 past disabled 1 straight to 2
  assert.equal(nextIndex('ArrowRight', opts), 2)
})

test('RovingFocus: handles Home, End, and RTL navigation', () => {
  const opts = { count: 4, active: 1, orientation: 'horizontal' as const }
  assert.equal(nextIndex('Home', opts), 0)
  assert.equal(nextIndex('End', opts), 3)

  // RTL inverts ArrowRight to previous and ArrowLeft to next
  const rtlOpts = { count: 3, active: 1, orientation: 'horizontal' as const, rtl: true }
  assert.equal(nextIndex('ArrowRight', rtlOpts), 0)
  assert.equal(nextIndex('ArrowLeft', rtlOpts), 2)
})

test('RovingFocus: tabStops guarantees single tab stop', () => {
  const stops = tabStops({ count: 3, active: 1 })
  assert.deepEqual(stops, [-1, 0, -1])

  // If active item becomes disabled, fallback moves tabIndex to first available
  const fallbackStops = tabStops({ count: 3, active: 1, disabled: [1] })
  assert.deepEqual(fallbackStops, [0, -1, -1])
})

test('Typeahead: buffers characters and cycles repeated identical keys', () => {
  const labels = ['Apple', 'Banana', 'Blueberry', 'Cherry']

  // Direct match
  assert.equal(searchIndex('b', { labels, active: 0 }), 1) // Banana
  assert.equal(searchIndex('bl', { labels, active: 0 }), 2) // Blueberry

  // Repeated 'b' cycles to next item starting with 'b'
  assert.equal(searchIndex('bb', { labels, active: 1 }), 2) // Blueberry after Banana
})

test('Typeahead: isTypeaheadKey allows space only during ongoing query', () => {
  assert.equal(isTypeaheadKey('a', false), true)
  assert.equal(isTypeaheadKey(' ', false), false) // Space triggers action
  assert.equal(isTypeaheadKey(' ', true), true) // Space accepted inside "New Folder"
})

test('Typeahead: nextSearch resets buffer after timeout', () => {
  assert.equal(nextSearch('app', 'l', 200), 'appl')
  assert.equal(nextSearch('app', 'b', 1500), 'b') // reset after 1000ms
})
