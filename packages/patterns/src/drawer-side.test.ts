import assert from 'node:assert/strict'
import { test } from 'node:test'
import { physicalSide } from './drawer-side.ts'

test('start and end follow the reading direction; left and right do not', () => {
  assert.equal(physicalSide('start', false), 'left')
  assert.equal(physicalSide('start', true), 'right')
  assert.equal(physicalSide('end', false), 'right')
  assert.equal(physicalSide('end', true), 'left')
  assert.equal(physicalSide('left', true), 'left')
  assert.equal(physicalSide('right', true), 'right')
})
