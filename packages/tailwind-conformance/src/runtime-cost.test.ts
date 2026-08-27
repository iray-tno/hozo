import assert from 'node:assert/strict'
import { test } from 'node:test'

import { measureRuntimeCost } from './runtime-cost.ts'

// The report records these numbers and fails on any change, which catches
// a regression without saying what broke. These say what each one means,
// so a moved number arrives with its own explanation.
const cost = measureRuntimeCost()

test('every component renders exactly once to appear', () => {
  assert.equal(cost.mount, cost.components)
})

test('a resize inside a breakpoint renders nothing at all', () => {
  // The claim `hooks.native.ts` makes and the reason `breakpointStore` and
  // `viewportStore` are separate: a component asking about `md:` is asking
  // about a bucket, and 390 to 420 does not leave it. Sharing one snapshot
  // would make this the whole scene.
  assert.equal(cost.resizeWithinBreakpoint, 0)
})

test('crossing a breakpoint renders only what asked about one', () => {
  // A third of the scene uses `md:`; the plain and `dark:` components have
  // no business hearing about a width.
  assert.equal(cost.breakpointCross, cost.components / 3)
})

test('changing the colour scheme renders only what asked about it', () => {
  assert.equal(cost.colorSchemeChange, cost.components / 3)
})
