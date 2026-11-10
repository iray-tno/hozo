import assert from 'node:assert/strict'
import test from 'node:test'
import { type GradientSpec, hozoGradientStyles } from './gradient-slots.ts'

const defaults = { color: '#0000', positions: ['0%', '50%', '100%'] }
const base = Object.freeze({ backgroundImage: 'base', opacity: 0.5 })
const bottom = Object.freeze({ backgroundImage: 'bottom' })
const green = Object.freeze({})
const via = Object.freeze({})
const none = Object.freeze({ backgroundImage: 'none' })
const specs: GradientSpec[] = [
  [
    base,
    {
      image: { kind: 'linear-gradient', prelude: 'to right' },
      colors: [
        [0, 'red'],
        [2, 'blue'],
      ],
    },
  ],
  [bottom, { image: { kind: 'linear-gradient', prelude: 'to bottom' } }],
  [green, { colors: [[0, 'green']], positions: [[2, '90%']] }],
  [via, { colors: [[1, 'yellow']] }],
  [none, { image: null }],
]
const flat = (styles: ReturnType<typeof hozoGradientStyles>) => Object.assign({}, ...styles)

test('gradient registers compose without copying base values over another condition', () => {
  const result = hozoGradientStyles([base, [false, bottom, green]], specs, defaults)
  assert.equal(result[0], base)
  assert.deepEqual(flat(result), {
    opacity: 0.5,
    backgroundImage: 'linear-gradient(to bottom, green 0%, blue 90%)',
  })
  assert.equal(
    flat(hozoGradientStyles([base, green, bottom], specs, defaults)).backgroundImage,
    'linear-gradient(to bottom, green 0%, blue 90%)',
  )
  assert.equal(
    flat(hozoGradientStyles([base], specs, defaults)).backgroundImage,
    'linear-gradient(to right, red 0%, blue 100%)',
  )
})

test('none/raw images retain stop registers for a later constructor and via-none clears only via', () => {
  const raw = { backgroundImage: 'linear-gradient(black, white)' }
  const clear = {}
  const metadata: GradientSpec[] = [
    ...specs,
    [raw, { image: raw.backgroundImage }],
    [clear, { colors: [[1, null]] }],
  ]
  assert.equal(flat(hozoGradientStyles([base, none], metadata, defaults)).backgroundImage, 'none')
  assert.equal(
    flat(hozoGradientStyles([base, via, none, bottom], metadata, defaults)).backgroundImage,
    'linear-gradient(to bottom, red 0%, yellow 50%, blue 100%)',
  )
  assert.equal(
    flat(hozoGradientStyles([base, raw], metadata, defaults)).backgroundImage,
    raw.backgroundImage,
  )
  assert.equal(
    flat(hozoGradientStyles([base, via, raw, clear, bottom], metadata, defaults)).backgroundImage,
    'linear-gradient(to bottom, red 0%, blue 100%)',
  )
})

test('stop-only writes do not invent an image and caller styles keep whole-property precedence', () => {
  assert.deepEqual(hozoGradientStyles([green], specs, defaults), [green])
  const caller = { backgroundImage: 'url(caller)' }
  assert.equal(
    flat(hozoGradientStyles([base, caller, green], specs, defaults)).backgroundImage,
    caller.backgroundImage,
  )
  assert.equal(
    flat(hozoGradientStyles([base, caller, bottom], specs, defaults)).backgroundImage,
    'linear-gradient(to bottom, #0000 0%, #0000 100%)',
  )
})

test('opaque numeric RN styles retain the previous path without a platform import', () => {
  assert.deepEqual(hozoGradientStyles([base, 12, bottom], specs, defaults), [base, 12, bottom])
})

test('preindexed metadata is never enumerated during selected-style resolution', () => {
  const metadata = new Map(specs)
  metadata[Symbol.iterator] = () => {
    throw new Error('namespace scan')
  }
  assert.match(
    String(flat(hozoGradientStyles([base, green], metadata, defaults)).backgroundImage),
    /green 0%/,
  )
})
