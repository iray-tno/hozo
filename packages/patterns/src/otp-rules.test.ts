import assert from 'node:assert/strict'
import { test } from 'node:test'
import { otpActiveIndex, otpCaret, otpValue } from './otp-rules.ts'

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

test('virtual carets use collapsed host selection and a full code ends after its last cell', () => {
  for (const [value, offset, index, after] of [
    ['', 0, 0, false],
    ['12', 1, 1, false],
    ['12', 2, 2, false],
    ['1234', 4, 3, true],
    ['😀x', 2, 1, false],
  ] as const) {
    assert.deepEqual(otpCaret(value, 4, { value, start: offset, end: offset }), { index, after })
  }
  for (const selection of [
    null,
    { value: 'old', start: 1, end: 1 },
    { value: '12', start: 0, end: 2 },
    { value: '12', start: -1, end: -1 },
    { value: '12', start: 3, end: 3 },
    { value: '12', start: Number.NaN, end: Number.NaN },
  ])
    assert.equal(otpCaret('12', 4, selection), null)
  assert.equal(otpCaret('😀', 4, { value: '😀', start: 1, end: 1 }), null)
  assert.equal(otpCaret('', 0, { value: '', start: 0, end: 0 }), null)
})
