import assert from 'node:assert/strict'
import { test } from 'node:test'
import { otpActiveIndex, otpValue } from './otp-rules.ts'

test('a numeric code keeps its digits and nothing else, up to its length', () => {
  assert.equal(otpValue('12a3', 6, 'number'), '123')
  assert.equal(otpValue('1234567', 6, 'number'), '123456')
})

test('a pasted code with its spaces or dashes is the code', () => {
  assert.equal(otpValue('123 456', 6, 'number'), '123456')
  assert.equal(otpValue('123-456', 6, 'number'), '123456')
  assert.equal(otpValue('AB-CD 12', 6, 'text'), 'ABCD12')
})

test('a text code keeps letters, counted as characters rather than code units', () => {
  assert.equal(otpValue('a1b2', 4, 'text'), 'a1b2')
  assert.equal(otpValue('😀😀😀', 2, 'text'), '😀😀')
})

test('the active cell follows what has been entered and stops at the last', () => {
  assert.equal(otpActiveIndex('', 6), 0)
  assert.equal(otpActiveIndex('123', 6), 3)
  assert.equal(otpActiveIndex('123456', 6), 5)
})
