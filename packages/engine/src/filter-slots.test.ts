import assert from 'node:assert/strict'
import { test } from 'node:test'
import { type FilterSpec, hozoFilterStyles } from './filter-slots.ts'
import { hozoTransformStyles } from './transform-slots.ts'

const blur = Object.freeze({ filter: 'blur(8px)', opacity: 0.8 })
const sepia = Object.freeze({ filter: 'sepia(100%)' })
const reset = Object.freeze({ filter: 'none' })
const specs: FilterSpec[] = [
  [blur, { mode: 'slots', slots: [[0, 'blur(8px)']] }],
  [sepia, { mode: 'slots', slots: [[7, 'sepia(100%)']] }],
  [reset, { mode: 'none' }],
]
const flat = (value: ReturnType<typeof hozoFilterStyles>) => Object.assign({}, ...value)

test('compiler slots compose in numeric order without mutating or cloning authored entries', () => {
  const result = hozoFilterStyles([sepia, [false, blur]], specs)
  assert.equal(result[0], sepia)
  assert.equal(result[1], blur)
  assert.deepEqual(flat(result), { filter: 'blur(8px) sepia(100%)', opacity: 0.8 })
  assert.equal(flat(hozoFilterStyles([blur, false], specs)).filter, 'blur(8px)')
})

test('none and authored chains hide, but do not erase, compiled registers', () => {
  const raw = { filter: 'contrast(40%)' }
  const metadata: FilterSpec[] = [...specs, [raw, { mode: 'authored', authored: raw.filter }]]
  assert.equal(flat(hozoFilterStyles([blur, reset], metadata)).filter, 'none')
  assert.equal(
    flat(hozoFilterStyles([blur, reset, sepia], metadata)).filter,
    'blur(8px) sepia(100%)',
  )
  assert.equal(flat(hozoFilterStyles([blur, raw], metadata)).filter, raw.filter)
  assert.equal(flat(hozoFilterStyles([blur, raw, sepia], metadata)).filter, 'blur(8px) sepia(100%)')
})

test('an unregistered caller filter keeps normal RN whole-property precedence', () => {
  const authored = { filter: [{ brightness: 0.5 }] }
  assert.equal(flat(hozoFilterStyles([blur, authored], specs)).filter, authored.filter)
  assert.equal(flat(hozoFilterStyles([blur, authored, sepia], specs)).filter, 'sepia(100%)')
  const output = hozoFilterStyles([{ width: 20 }], specs)
  assert.deepEqual(output, [{ width: 20 }])
})

test('filter and transform metadata can address the same frozen style objects', () => {
  const base = Object.freeze({ filter: 'blur(8px)', transform: [{ translateX: 8 }] })
  const active = Object.freeze({ filter: 'sepia(100%)', transform: [{ translateY: 12 }] })
  const result = hozoTransformStyles(
    hozoFilterStyles(
      [base, active],
      [
        [base, { mode: 'slots', slots: [[0, 'blur(8px)']] }],
        [active, { mode: 'slots', slots: [[7, 'sepia(100%)']] }],
      ],
    ),
    [
      [base, { translate: 'slots', translateSlots: base.transform }],
      [active, { translate: 'slots', translateSlots: active.transform }],
    ],
  )
  assert.deepEqual(Object.assign({}, ...result), {
    filter: 'blur(8px) sepia(100%)',
    transform: [{ translateX: 8 }, { translateY: 12 }],
  })
})

test('preindexed metadata resolves selected styles without iterating the project map', () => {
  const metadata = new Map(specs)
  metadata[Symbol.iterator] = () => {
    throw new Error('namespace scan')
  }
  assert.equal(flat(hozoFilterStyles([sepia, blur], metadata)).filter, 'blur(8px) sepia(100%)')
})
