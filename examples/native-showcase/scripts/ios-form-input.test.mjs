import assert from 'node:assert/strict'
import test from 'node:test'
import { enterIosText } from './ios-form-input.mjs'

test('input sends each character once and confirms every exact prefix before continuing', async () => {
  const events = []
  const observation = {}
  await enterIosText('Hozo', {
    send: (character) => events.push(['key', character]),
    waitForValue: (value) => events.push(['value', value]),
    observation,
  })
  assert.deepEqual(events, [
    ['key', 'H'],
    ['value', 'H'],
    ['key', 'o'],
    ['value', 'Ho'],
    ['key', 'z'],
    ['value', 'Hoz'],
    ['key', 'o'],
    ['value', 'Hozo'],
  ])
  assert.deepEqual(observation, {
    strategy: 'confirmed-prefixes',
    requested: 'Hozo',
    confirmed: ['H', 'Ho', 'Hoz', 'Hozo'],
  })
})

test('an asynchronously consumed key prevents submitting the next key prematurely', async () => {
  const sent = []
  let confirmFirst
  let waiting
  const firstWait = new Promise((resolve) => {
    waiting = resolve
  })
  const input = enterIosText('Ho', {
    send: (character) => sent.push(character),
    waitForValue: (value) => {
      if (value === 'H') {
        waiting()
        return new Promise((resolve) => {
          confirmFirst = resolve
        })
      }
    },
    observation: {},
  })
  await firstWait
  assert.deepEqual(sent, ['H'])
  confirmFirst()
  await input
  assert.deepEqual(sent, ['H', 'o'])
})

test('a missing or corrected character fails without retyping it or sending later keys', async () => {
  const sent = []
  const observation = {}
  const mismatch = new Error('expected Ho, observed H')
  await assert.rejects(
    enterIosText('Hozo', {
      send: (character) => sent.push(character),
      waitForValue: (value) => {
        if (value === 'Ho') throw mismatch
      },
      observation,
    }),
    (error) => error === mismatch,
  )
  assert.deepEqual(sent, ['H', 'o'])
  assert.deepEqual(observation.confirmed, ['H'])
  assert.equal(observation.pendingPrefix, 'Ho')
})

test('ambiguous HID delivery fails without retrying or pretending the value was confirmed', async () => {
  let sends = 0
  const observation = {}
  const failure = new Error('HID command timed out')
  await assert.rejects(
    enterIosText('Hozo', {
      send: () => {
        sends++
        throw failure
      },
      waitForValue: () => assert.fail('failed input must not proceed'),
      observation,
    }),
    (error) => error === failure,
  )
  assert.equal(sends, 1)
  assert.deepEqual(observation.confirmed, [])
  assert.equal(observation.pendingPrefix, 'H')
})
