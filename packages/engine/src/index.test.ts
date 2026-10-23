import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import type { StateGroup } from './class-resolver.ts'
import { createClassResolver } from './index.ts'

test('utility rank is cache-fill work and unknown overlapping classes retain order', () => {
  let reads = 0
  const order = new Proxy(
    { small: 0, large: 1, axis: 2, unknown: null } as Record<string, number | null>,
    {
      get(target, key: string) {
        reads++
        return target[key]
      },
    },
  )
  const resolve = createClassResolver(
    {
      small: { paddingLeft: 8 },
      large: { paddingLeft: 40 },
      axis: { paddingLeft: 4 },
      unknown: { paddingLeft: 100 },
    },
    {},
    undefined,
    {},
    {},
    order,
  )
  assert.equal(resolve('large small').at(-1)?.paddingLeft, 40)
  const before = reads
  for (let i = 0; i < 30; i++) assert.equal(resolve('large small').at(-1)?.paddingLeft, 40)
  assert.equal(reads, before)
  assert.equal(resolve('axis large small').at(-1)?.paddingLeft, 4)
  assert.equal(resolve('large unknown small').at(-1)?.paddingLeft, 8)
})

test('build-time owner-state rank is consumed once per cache entry, with tie and warning provenance intact', () => {
  let reads = 0
  const ranked = (keys: string[], color: string, order: number): StateGroup => {
    const group = [keys, { color }] as unknown as StateGroup
    Object.defineProperty(group, 2, {
      get: () => {
        reads++
        return order
      },
    })
    return group
  }
  const states = {
    active: [ranked(['pressed'], 'active', 264)],
    focus: [ranked(['focused'], 'focus', 258)],
    own: [ranked(['focused'], 'own', 258)],
    both: [ranked(['hovered', 'focused'], 'both', 515)],
  }
  const cx = createClassResolver({}, {}, undefined, states)
  const value = 'active focus own both'
  assert.equal(cx(value, { pressed: true, focused: true, hovered: true }).at(-1)?.color, 'both')
  const initial = reads
  for (let i = 0; i < 20; i++) {
    assert.equal(
      cx(value, { pressed: true, focused: true, hovered: false }).at(-1)?.color,
      'active',
    )
    assert.equal(cx(value, { pressed: false, focused: true, hovered: false }).at(-1)?.color, 'own')
  }
  assert.equal(reads, initial, 'state changes do not rescan or sort rank metadata')
  const warn = mock.method(console, 'warn', () => {})
  try {
    cx(value, { pressed: false, hovered: false })
    assert.ok(
      warn.mock.calls.some((call) =>
        String(call.arguments[0]).includes('`focus` needs state (focused)'),
      ),
    )
  } finally {
    warn.mock.restore()
  }
})

test('utility order separates conditions and base barriers while retaining logical boundaries', () => {
  const resolve = createClassResolver(
    { small: { paddingTop: 8 }, large: { paddingTop: 40 } },
    {},
    undefined,
    {
      disabledLarge: [[['disabled'], { paddingTop: 40 }]],
      disabledSmall: [[['disabled'], { paddingTop: 8 }]],
      active: [[['pressed'], { paddingTop: 16 }]],
      activeOpacity: [[['pressed'], { opacity: 0.5 }]],
      unknown: [[['hovered'], { paddingTop: 12 }]],
      logical: [[['hovered'], { paddingStart: 12 }]],
    },
    {},
    {
      small: 0,
      large: 1,
      disabledSmall: 2,
      disabledLarge: 3,
      active: 4,
      unknown: null,
      logical: null,
    },
  )
  const state = { disabled: true, pressed: true, hovered: false }
  assert.equal(resolve('disabledLarge disabledSmall', state).at(-1)?.paddingTop, 40)
  assert.equal(resolve('disabledLarge active disabledSmall', state).at(-1)?.paddingTop, 40)
  assert.equal(
    resolve('activeOpacity disabledLarge active disabledSmall', state).at(-1)?.paddingTop,
    40,
  )
  assert.equal(resolve('large small unknown', state).at(-1)?.paddingTop, 40)
  assert.equal(resolve('large small logical', state).at(-1)?.paddingTop, 8)
})

const STYLES = {
  'p-4': { paddingTop: 16, paddingRight: 16, paddingBottom: 16, paddingLeft: 16 },
  'bg-blue-500': { backgroundColor: '#3b82f6' },
  'p-8': { paddingTop: 32 },
}

test('resolves each class in the string, in order', () => {
  const cx = createClassResolver(STYLES)
  assert.deepEqual(cx('p-4 bg-blue-500'), [STYLES['p-4'], STYLES['bg-blue-500']])
})

test('legacy candidate maps without ordering metadata retain authored last-wins', () => {
  // Generated maps can now supply assessed ranks, without changing the ABI
  // of legacy callers that intentionally pass only a name-to-style lookup.
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
  assert.deepEqual(cx('hover:active:p-8', { pressed: true, hovered: false }), [])
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

// A direction is fixed for the run, so the module supplies it and no element
// has to.
const DIRECTION = {
  'rtl:opacity-50': [[['rtl'], { opacity: 0.5 }]],
  'ltr:opacity-80': [[['ltr'], { opacity: 0.8 }]],
  'rtl:active:p-8': [[['rtl', 'pressed'], { paddingTop: 32 }]],
} as const

test('a direction class is decided once, after the unconditional ones, with no state', () => {
  const rtl = createClassResolver(STYLES, {}, undefined, DIRECTION, { rtl: true, ltr: false })
  const ltr = createClassResolver(STYLES, {}, undefined, DIRECTION, { rtl: false, ltr: true })
  const warn = mock.method(console, 'warn', () => {})
  try {
    // Written first and still applied last, as a variant is in CSS.
    const value = 'rtl:opacity-50 ltr:opacity-80 p-4'
    assert.deepEqual(rtl(value), [STYLES['p-4'], { opacity: 0.5 }])
    assert.deepEqual(ltr(value), [STYLES['p-4'], { opacity: 0.8 }])
    assert.equal(rtl(value), rtl(value), 'decided once, so cached like an unconditional class')
    assert.equal(warn.mock.callCount(), 0)
  } finally {
    warn.mock.restore()
  }
})

test('a direction beside a state still needs the element to supply the state', () => {
  const cx = createClassResolver(STYLES, {}, undefined, DIRECTION, { rtl: true, ltr: false })
  assert.deepEqual(cx('rtl:active:p-8', { pressed: false }), [])
  assert.deepEqual(cx('rtl:active:p-8', { pressed: true }), [{ paddingTop: 32 }])
})

test('a string with no state classes keeps its one cached array, state or not', () => {
  const cx = createClassResolver(STYLES, {}, undefined, STATES)
  assert.equal(cx('p-4', { pressed: true }), cx('p-4'))
})

test('partial owner state names missing facts once without treating known false as missing', () => {
  const cx = createClassResolver(STYLES, {}, undefined, STATES)
  const warn = mock.method(console, 'warn', () => {})
  try {
    const classes = 'p-4 hover:active:p-8 disabled:opacity-50'
    assert.deepEqual(cx(classes, { focused: true }), [STYLES['p-4']])
    cx(classes, { focused: false })
    assert.equal(warn.mock.callCount(), 2)
    assert.match(warn.mock.calls[0].arguments[0] as string, /hovered, pressed/)
    assert.match(warn.mock.calls[1].arguments[0] as string, /disabled/)
    assert.deepEqual(cx(classes, { hovered: false, pressed: false, disabled: false }), [
      STYLES['p-4'],
    ])
    assert.equal(warn.mock.callCount(), 2)
    assert.deepEqual(cx(classes, { hovered: true, pressed: true, disabled: true }), [
      STYLES['p-4'],
      { paddingTop: 32 },
      { opacity: 0.5 },
    ])
  } finally {
    warn.mock.restore()
  }
})
