import assert from 'node:assert/strict'
import test from 'node:test'
import { enterIosText, inputObstruction } from './ios-form-input.mjs'

test('input sends each character once and confirms every exact prefix before continuing', async () => {
  const events = []
  const observation = {}
  let clock = 0
  await enterIosText('Hozo', {
    send: (character) => events.push(['key', character]),
    waitForValue: (value) => events.push(['value', value]),
    observation,
    now: () => (clock += 5),
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
    // Each send timed, so a held key shows as a long send (#1279).
    sends: [
      { character: 'H', startedAt: 5, sendMs: 5 },
      { character: 'o', startedAt: 15, sendMs: 5 },
      { character: 'z', startedAt: 25, sendMs: 5 },
      { character: 'o', startedAt: 35, sendMs: 5 },
    ],
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

test('a value that never appears records what covered the field, then fails as before', async () => {
  const observation = {}
  const timeout = new Error('Timed out: name input contains "H"')
  let inspected = 0
  await assert.rejects(
    enterIosText('Hozo', {
      send: () => {},
      waitForValue: () => {
        throw timeout
      },
      observation,
      inspect: () => {
        inspected++
        return { kind: 'os-character-popup', candidates: ['Ħ'], fieldVisible: false }
      },
    }),
    (error) => error === timeout,
  )
  assert.equal(inspected, 1)
  assert.deepEqual(observation.confirmed, [])
  assert.equal(observation.pendingPrefix, 'H')
  assert.equal(observation.obstruction.kind, 'os-character-popup')
})

test('the AX tree tells a character popup from a field that is simply not there', () => {
  const field = { AXLabel: 'Display name', type: 'TextField', AXValue: 'H' }
  const isField = (node) => node.AXLabel === 'Display name' && /TextField/.test(node.type)
  // The tree #1279's failure saved: the popup, its keys, no field.
  assert.deepEqual(
    inputObstruction(
      [
        { AXUniqueId: 'PopoverDismissRegion', AXLabel: 'dismiss popup' },
        { AXLabel: 'Ħ' },
        { AXLabel: '1' },
      ],
      isField,
    ),
    { kind: 'os-character-popup', candidates: ['Ħ', '1'], fieldVisible: false },
  )
  assert.deepEqual(inputObstruction([field], isField), { kind: 'field-visible', value: 'H' })
  assert.deepEqual(inputObstruction([], isField), { kind: 'field-not-visible' })
})
