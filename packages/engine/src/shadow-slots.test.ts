import assert from 'node:assert/strict'
import test from 'node:test'
import { hozoShadowStyles } from './shadow-slots.ts'

const defaults = { ring: 'currentcolor', offset: '#fff' }
const outer = Object.freeze({ boxShadow: '0 1px 2px rgb(0 0 0 / 0.1)' })
const color = Object.freeze({})
const ring = Object.freeze({ boxShadow: '0 0 0 2px currentcolor' })
const specs = [
  [outer, { outer: { value: outer.boxShadow, parts: [['0 1px 2px ', '']] } }],
  [color, { outerColor: '#f00' }],
  [ring, { ringWidth: 2 }],
] as const

test('uses original style identities, selected metadata and no project scan', () => {
  const map = new Map<object, unknown>(specs)
  map[Symbol.iterator] = () => {
    throw new Error('must not iterate a prebuilt metadata map')
  }
  const composed = hozoShadowStyles(
    [outer, [color, ring]],
    map as Parameters<typeof hozoShadowStyles>[1],
    defaults,
  )
  assert.deepEqual(composed, [
    outer,
    color,
    ring,
    { boxShadow: '0 0 0 2px currentcolor, 0 1px 2px #f00' },
  ])
  assert.equal(composed[0], outer)
})

test('respects a whole authored shadow and does not override an opaque registered style ID', () => {
  const caller = { boxShadow: [] }
  assert.deepEqual(hozoShadowStyles([outer, color, caller], specs, defaults), [
    outer,
    color,
    caller,
  ])
  assert.deepEqual(hozoShadowStyles([outer, 5, color], specs, defaults), [outer, 5, color])
})
