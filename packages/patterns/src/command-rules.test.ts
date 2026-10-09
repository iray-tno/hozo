import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nextActive, rankCommands } from './command-rules.ts'

const COMMANDS = [
  { label: 'Create project' },
  { label: 'Project settings' },
  { label: 'Settings', keywords: ['preferences', 'options'] },
  { label: 'Open recent projects' },
  { label: 'Delete', disabled: true },
]
const labels = (query: string) => rankCommands(COMMANDS, query).map((i) => COMMANDS[i]?.label)

test('a blank query shows everything, in the order given', () => {
  assert.deepEqual(
    labels(''),
    COMMANDS.map((c) => c.label),
  )
  assert.deepEqual(
    labels('   '),
    COMMANDS.map((c) => c.label),
  )
})

test('prefix beats word start beats contains beats letters in order', () => {
  assert.deepEqual(labels('pro'), ['Project settings', 'Create project', 'Open recent projects'])
  assert.deepEqual(labels('ject'), ['Create project', 'Project settings', 'Open recent projects'])
  assert.deepEqual(labels('crpj'), ['Create project'])
})

test('keywords find a command, one step below a label match', () => {
  assert.deepEqual(labels('pref'), ['Settings'])
  assert.deepEqual(labels('set'), ['Settings', 'Project settings'])
})

test('case does not matter, and nothing matching is nothing', () => {
  assert.deepEqual(labels('SETTINGS'), ['Settings', 'Project settings'])
  assert.deepEqual(labels('zzz'), [])
})

test('the active command moves past disabled ones and stops at the ends', () => {
  const order = [0, 4, 2]
  assert.equal(nextActive(order, COMMANDS, null, 1), 0)
  assert.equal(nextActive(order, COMMANDS, 0, 1), 2)
  assert.equal(nextActive(order, COMMANDS, 2, 1), 2)
  assert.equal(nextActive(order, COMMANDS, null, -1), 2)
  assert.equal(nextActive([4], COMMANDS, null, 1), null)
})
