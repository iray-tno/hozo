import assert from 'node:assert/strict'
import test from 'node:test'

import { hozoSpreadStyles } from './spread-styles.ts'

const box = { maxHeight: 240 }

test('a spread without the prop leaves the compiled style alone', () => {
  assert.deepEqual(hozoSpreadStyles({ style: box }, [], { testID: 'a' }), {
    testID: 'a',
    style: box,
  })
})

test("the caller's style composes after the compiled one, which survives", () => {
  const own = { paddingTop: 19, marginTop: 7 }
  const props = hozoSpreadStyles({ style: box, optionStyle: 'o' }, [], { style: own })
  assert.deepEqual(props, { style: [box, own], optionStyle: 'o' })
})

test('the last spread to carry the prop wins among spreads, as in JSX', () => {
  const props = hozoSpreadStyles({ style: box }, [], { style: 'a' }, { x: 1 }, { style: 'b' })
  assert.deepEqual(props, { style: [box, 'b'], x: 1 })
})

test('a style the author wrote after every spread drops the spread copy', () => {
  // The compiled value already ends with that style.
  const props = hozoSpreadStyles({ style: [box, 'mine'] }, ['style'], { style: 'theirs' })
  assert.deepEqual(props, { style: [box, 'mine'] })
})

test('each source is read once, in order', () => {
  const reads: string[] = []
  const rest = {
    get style() {
      reads.push('style')
      return { paddingTop: 1 }
    },
    get testID() {
      reads.push('testID')
      return 't'
    },
  }
  const later = {
    get accessibilityLabel() {
      reads.push('later')
      return 'L'
    },
  }
  const props = hozoSpreadStyles({ style: box }, [], rest, later)
  assert.deepEqual(reads, ['style', 'testID', 'later'])
  assert.deepEqual(props.style, [box, { paddingTop: 1 }])
})

test('a style function on either side stays a function of the same state', () => {
  const pressed = ({ pressed }: { pressed: boolean }) => (pressed ? 'down' : 'up')
  const own = (state: { pressed: boolean }) => (state.pressed ? 'own-down' : 'own-up')
  const composed = hozoSpreadStyles({ style: pressed }, [], { style: own }).style as (
    state: unknown,
  ) => unknown
  assert.deepEqual(composed({ pressed: true }), ['down', 'own-down'])
  const plain = hozoSpreadStyles({ style: pressed }, [], { style: 'x' }).style as (
    state: unknown,
  ) => unknown
  assert.deepEqual(plain({ pressed: false }), ['up', 'x'])
})

test('an explicit undefined is still the caller passing the prop, and null spreads are skipped', () => {
  assert.deepEqual(hozoSpreadStyles({ style: box }, [], null, { style: undefined }).style, [
    box,
    undefined,
  ])
  const proto = JSON.parse('{"__proto__": {"x": 1}}')
  assert.ok(Object.hasOwn(hozoSpreadStyles({}, [], proto), '__proto__'))
})
