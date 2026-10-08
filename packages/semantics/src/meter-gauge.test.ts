import assert from 'node:assert/strict'
import { test } from 'node:test'
import { meterGauge } from './meter-gauge.ts'

test('the range is 0 to 1 when left out, and the amount is clamped into it', () => {
  assert.deepEqual(meterGauge({ value: 0.6 }), { fraction: 0.6, region: 'optimum' })
  assert.equal(meterGauge({ value: 2 }).fraction, 1)
  assert.equal(meterGauge({ value: -1 }).fraction, 0)
  assert.equal(meterGauge({ value: 30, min: 20, max: 70 }).fraction, 0.2)
})

test('a range with no width is empty rather than dividing by zero', () => {
  assert.equal(meterGauge({ value: 5, min: 5, max: 5 }).fraction, 0)
  // `max` below `min` is read as `min`, as the browser reads it.
  assert.equal(meterGauge({ value: 5, min: 5, max: 1 }).fraction, 0)
})

test('with no boundaries, every amount is good', () => {
  for (const value of [0, 0.3, 1]) assert.equal(meterGauge({ value }).region, 'optimum')
})

test('an optimum between the boundaries makes the middle good and both sides fair', () => {
  const at = (value: number) => meterGauge({ value, low: 0.2, high: 0.8, optimum: 0.5 }).region
  assert.equal(at(0.1), 'suboptimal')
  assert.equal(at(0.2), 'optimum')
  assert.equal(at(0.5), 'optimum')
  assert.equal(at(0.8), 'optimum')
  assert.equal(at(0.9), 'suboptimal')
})

test('an optimum above high makes the top good, the middle fair and the bottom poor', () => {
  const at = (value: number) => meterGauge({ value, low: 0.2, high: 0.8, optimum: 0.9 }).region
  assert.equal(at(0.9), 'optimum')
  assert.equal(at(0.8), 'optimum')
  assert.equal(at(0.5), 'suboptimal')
  assert.equal(at(0.2), 'suboptimal')
  assert.equal(at(0.1), 'even-less-good')
})

test('an optimum below low makes the bottom good, the middle fair and the top poor', () => {
  // A disk: emptier is better.
  const at = (value: number) => meterGauge({ value, low: 0.6, high: 0.9, optimum: 0 }).region
  assert.equal(at(0.3), 'optimum')
  assert.equal(at(0.6), 'optimum')
  assert.equal(at(0.61), 'suboptimal')
  assert.equal(at(0.9), 'suboptimal')
  assert.equal(at(0.91), 'even-less-good')
  assert.equal(at(1), 'even-less-good')
})

test('boundaries outside the range are clamped before they are compared', () => {
  // `high` below `low` is read as `low`; `low` below `min` as `min`.
  assert.equal(meterGauge({ value: 0.5, low: 0.6, high: 0.1, optimum: 0 }).region, 'optimum')
  assert.equal(meterGauge({ value: 0.05, low: -3, high: 0.1, optimum: 1 }).region, 'suboptimal')
  assert.equal(meterGauge({ value: 0.1, low: -3, high: 0.1, optimum: 1 }).region, 'optimum')
})
