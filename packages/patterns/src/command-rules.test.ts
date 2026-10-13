import assert from 'node:assert/strict'
import { test } from 'node:test'
import { currentCommand, nextActive, rankCommands } from './command-rules.ts'

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

test('the current command retains a visible enabled target, otherwise takes the first enabled result', () => {
  const order = [4, 2, 0]
  assert.equal(currentCommand(order, COMMANDS, null), 2)
  assert.equal(currentCommand(order, COMMANDS, 0), 0)
  assert.equal(currentCommand(order, COMMANDS, 4), 2, 'disabled targets are never current')
  assert.equal(currentCommand([2], COMMANDS, 0), 2, 'a filtered target is not retained')
  assert.equal(currentCommand([], COMMANDS, 0), null)
  assert.equal(currentCommand([4], COMMANDS, 4), null)
  assert.equal(
    currentCommand(
      order,
      COMMANDS.map((command) => ({ ...command, disabled: true })),
      0,
    ),
    null,
    'a previously enabled target can become disabled',
  )
})
