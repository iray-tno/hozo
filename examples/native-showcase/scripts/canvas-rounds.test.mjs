import assert from 'node:assert/strict'
import test from 'node:test'
import { readCanvasRounds } from './canvas-rounds.mjs'

test('normal coverage uses one Canvas mount', () => {
  for (const value of [undefined, '', '1']) assert.equal(readCanvasRounds(value), 1)
})

test('manual stress coverage has an explicit finite total', () => {
  for (const value of ['2', '5', '10']) assert.equal(readCanvasRounds(value), Number(value))
})

test('invalid counts cannot turn a test into zero rounds or an unbounded run', () => {
  for (const value of ['0', '-1', '11', '1.5', 'Infinity', 'NaN', 'junk', ' 2', '02'])
    assert.throws(() => readCanvasRounds(value), /integer from 1 to 10/)
})
