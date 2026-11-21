import assert from 'node:assert/strict'
import test from 'node:test'
import { compareNativeCandidate } from './native.ts'

test('a starting style is probed beside a transition, where it has a driver', () => {
  const result = compareNativeCandidate('starting:opacity-0')
  assert.equal(result.verdict, 'COVERED', result.detail)
  assert.deepEqual(result.restrictedTo, ['View with a transition'])
})

test('a property no transition can animate from is still refused', () => {
  assert.equal(compareNativeCandidate('starting:flex').verdict, 'REFUSED')
})

test('the transition context is offered only to candidates that use starting', () => {
  // A transition with nothing to start from is refused on Native, so if
  // every candidate were probed there, nothing would be covered everywhere.
  const result = compareNativeCandidate('p-4')
  assert.equal(result.verdict, 'COVERED', result.detail)
  assert.equal(result.restrictedTo, undefined)
})
