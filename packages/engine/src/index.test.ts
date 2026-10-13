import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

import { createClassResolver } from './index.ts'

const STYLES = {
  'p-4': { paddingTop: 16, paddingRight: 16, paddingBottom: 16, paddingLeft: 16 },
  'bg-blue-500': { backgroundColor: '#3b82f6' },
  'p-8': { paddingTop: 32 },
}

test('resolves each class in the string, in order', () => {
  const cx = createClassResolver(STYLES)
  assert.deepEqual(cx('p-4 bg-blue-500'), [STYLES['p-4'], STYLES['bg-blue-500']])
})

test('keeps source order so React Native resolves conflicts last-wins', () => {
  // The whole reason this can be a lookup rather than a cascade engine:
  // every utility has the same specificity, so the array order *is* the
  // cascade, and RN already merges style arrays last-wins.
  const cx = createClassResolver(STYLES)
  assert.deepEqual(cx('p-8 p-4').at(-1), STYLES['p-4'])
  assert.deepEqual(cx('p-4 p-8').at(-1), STYLES['p-8'])
})

test('treats falsy input as no styles rather than an error', () => {
  // `cond && 'p-4'` evaluates to `false` whenever the condition is off.
  const cx = createClassResolver(STYLES)
  for (const value of [false, undefined, null, '', 0]) {
    assert.deepEqual(cx(value), [])
  }
})

test('tolerates irregular whitespace', () => {
  const cx = createClassResolver(STYLES)
  assert.deepEqual(cx('  p-4\n\tbg-blue-500  '), [STYLES['p-4'], STYLES['bg-blue-500']])
})

test('warns once for a class the compiler recognized but cannot express', () => {
  const cx = createClassResolver(STYLES, {
    'hover:bg-blue-500': '`hover:bg-blue-500` is conditional',
  })
  const warn = mock.method(console, 'warn', () => {})
  try {
    cx('hover:bg-blue-500')
    cx('p-4 hover:bg-blue-500')
    assert.equal(warn.mock.callCount(), 1, 'a list render must not repeat it per row')
    assert.match(warn.mock.calls[0].arguments[0] as string, /hover:bg-blue-500/)
  } finally {
    warn.mock.restore()
  }
})

test('stays silent on a class it never recognized', () => {
  // Could be the app's own non-Tailwind class; not Hozo's business.
  const cx = createClassResolver(STYLES)
  const warn = mock.method(console, 'warn', () => {})
  try {
    assert.deepEqual(cx('my-own-class'), [])
    assert.equal(warn.mock.callCount(), 0)
  } finally {
    warn.mock.restore()
  }
})

test('returns the same array for a repeated class string', () => {
  const cx = createClassResolver(STYLES)
  assert.equal(cx('p-4'), cx('p-4'), 'a new array each render would defeat RN memoization')
})

// #886. A class whose only condition is the element's own state, resolved
// against the state its pressable hands in.
const STATES = {
  'active:opacity-80': [[['pressed'], { opacity: 0.8 }]],
  'disabled:opacity-50': [[['disabled'], { opacity: 0.5 }]],
  'hover:active:p-8': [[['hovered', 'pressed'], { paddingTop: 32 }]],
} as const

test('a state class applies when its state holds, after the unconditional ones', () => {
  const cx = createClassResolver(STYLES, {}, undefined, STATES)
  const value = 'active:opacity-80 bg-blue-500'
  assert.deepEqual(cx(value, { pressed: false }), [STYLES['bg-blue-500']])
  assert.deepEqual(cx(value, { pressed: true }), [STYLES['bg-blue-500'], { opacity: 0.8 }])
})

test('a stacked state class needs every state it names', () => {
  const cx = createClassResolver(STYLES, {}, undefined, STATES)
  assert.deepEqual(cx('hover:active:p-8', { pressed: true }), [])
  assert.deepEqual(cx('hover:active:p-8', { pressed: true, hovered: true }), [{ paddingTop: 32 }])
})

test('without a state, a state class is named once and left out', () => {
  const cx = createClassResolver(STYLES, {}, undefined, STATES)
  const warn = mock.method(console, 'warn', () => {})
  try {
    assert.deepEqual(cx('p-4 disabled:opacity-50'), [STYLES['p-4']])
    cx('p-4 disabled:opacity-50')
    assert.equal(warn.mock.callCount(), 1)
    assert.match(warn.mock.calls[0].arguments[0] as string, /disabled:opacity-50/)
  } finally {
    warn.mock.restore()
  }
})

test('a string with no state classes keeps its one cached array, state or not', () => {
  const cx = createClassResolver(STYLES, {}, undefined, STATES)
  assert.equal(cx('p-4', { pressed: true }), cx('p-4'))
})
