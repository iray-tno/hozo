import assert from 'node:assert/strict'
import test from 'node:test'
import { tailwindClassesNativeRefusal } from '@hozo/compiler'

// The inventory (scripts/tailwind-order-inventory.mjs) separates a barrier
// Native could not express anyway from one it could, with this.
test('a class is refused on Native only when one of its writes is', () => {
  const [padding, accent, sticky, unknown] = tailwindClassesNativeRefusal([
    'p-2',
    'accent-red-500',
    'sticky',
    'not-a-class',
  ])
  assert.equal(padding, null)
  assert.match(accent!, /accent/)
  assert.ok(sticky)
  assert.equal(unknown, null)
})
