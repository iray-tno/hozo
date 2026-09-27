// The termination rule, against a fake reader.
//
// `check-utterances.mjs` only runs inside a headed browser against a built
// Storybook, so before this file the rule could only be tried by a five-minute
// CI job -- and the failure it was written to fix looked exactly like the
// failure of the fix not working. Here it needs nothing but Node.
//
// The fake is a list of visits the walk is driven through, cycling forever, and
// each case below is a shape the real reader produces: an ordinary story, a
// story with an open modal in it, a container announced twice, two elements
// that say the same thing, and a walk longer than the budget.

import assert from 'node:assert/strict'
import test from 'node:test'

import { walk } from './utterance-walk.mjs'

/**
 * A reader driven through `visits`, cycling from `loopsTo` once it runs out.
 *
 * Nodes are plain objects, because identity is the only thing the rule asks of
 * them -- the same object twice is the same element twice, which is what the
 * DOM gives the real one.
 */
function reader(visits, loopsTo = 0) {
  let at = 0
  const log = visits[0].says.slice()
  return {
    get activeNode() {
      return visits[at].node
    },
    next: async () => {
      at = at + 1 < visits.length ? at + 1 : loopsTo
      log.push(...visits[at].says)
    },
    spokenPhraseLog: async () => log.slice(),
    /** How many steps the walk actually took, for the budget cases. */
    get steps() {
      return at
    },
  }
}

const node = (name) => ({ name })

test('an ordinary story ends where it began, and says its first phrase once', async () => {
  const a = node('a')
  const { log, finished } = await walk(
    reader([
      { node: a, says: ['heading, Tabs, level 2'] },
      { node: node('b'), says: ['tablist'] },
      { node: node('c'), says: ['tab, Overview, selected'] },
    ]),
    400,
  )
  assert.equal(finished, true)
  assert.deepEqual(log, ['heading, Tabs, level 2', 'tablist', 'tab, Overview, selected'])
})

test('a story with an open modal ends, though it never returns to the start', async () => {
  // The case the first version could not read. Everything after the trigger is
  // inside `aria-modal="true"`, so the cursor cycles there and the opening
  // heading is never reached again.
  const dialog = node('dialog')
  const heading = node('heading')
  const done = node('done')
  const visits = [
    { node: node('story-heading'), says: ['heading, DateTimePicker, level 2'] },
    { node: node('trigger'), says: ['button, Departure, has popup dialog'] },
    { node: dialog, says: ['dialog, Choose a date and time'] },
    { node: heading, says: ['September 2026'] },
    { node: done, says: ['button, Done'] },
  ]
  // Loops back to the dialog, not to the story heading.
  const { log, finished } = await walk(reader(visits, 2), 400)
  assert.equal(finished, true)
  assert.deepEqual(log, [
    'heading, DateTimePicker, level 2',
    'button, Departure, has popup dialog',
    'dialog, Choose a date and time',
    'September 2026',
    'button, Done',
  ])
})

test('a container announced on the way in and out is not a repeat', async () => {
  // The reason a node on its own cannot be the key. Both of these are the same
  // DOM element, and stopping at the second would cut every story with a
  // container in it.
  const grid = node('grid')
  const { log, finished } = await walk(
    reader([
      { node: grid, says: ['grid, September 2026'] },
      { node: node('cell'), says: ['gridcell, Thursday, September 10, 2026', '10'] },
      { node: grid, says: ['end of grid, September 2026'] },
    ]),
    400,
  )
  assert.equal(finished, true)
  assert.deepEqual(log, [
    'grid, September 2026',
    'gridcell, Thursday, September 10, 2026',
    '10',
    'end of grid, September 2026',
  ])
})

test('two elements that say the same thing are not a repeat either', async () => {
  // The reason a phrase on its own cannot be the key. Two stepper glyphs, two
  // cells reading the same number in different months.
  const { log, finished } = await walk(
    reader([
      { node: node('up-hour'), says: ['▲'] },
      { node: node('up-minute'), says: ['▲'] },
      { node: node('period'), says: ['button, AM or PM'] },
    ]),
    400,
  )
  assert.equal(finished, true)
  assert.deepEqual(log, ['▲', '▲', 'button, AM or PM'])
})

test('a step that says nothing new is the end', async () => {
  const stuck = node('stuck')
  const { log, finished } = await walk(reader([{ node: stuck, says: ['only this'] }], 0), 400)
  assert.equal(finished, true)
  // The node repeats and so does the phrase, but the log stopped growing first
  // -- and either rule reaches the same answer here, which is the point.
  assert.deepEqual(log, ['only this'])
})

test('a walk longer than its budget is unfinished, and keeps every phrase it heard', async () => {
  const visits = Array.from({ length: 500 }, (_, index) => ({
    node: node(`n${index}`),
    says: [`phrase ${index}`],
  }))
  const { log, finished } = await walk(reader(visits), 40)
  // Reported as unfinished rather than returned as a shorter story, which is
  // the distinction `check-utterances.mjs` turns into two different messages.
  assert.equal(finished, false)
  assert.equal(log.length, 41, 'the opening phrase plus one per step taken')
  assert.equal(log.at(-1), 'phrase 40')
})

test('the budget is a guard, not a target: a short story does not spend it', async () => {
  const visits = [
    { node: node('a'), says: ['a'] },
    { node: node('b'), says: ['b'] },
  ]
  const driven = reader(visits)
  const { finished } = await walk(driven, 400)
  assert.equal(finished, true)
  assert.ok(driven.steps <= 2, `stopped after ${driven.steps} steps rather than walking on`)
})

test('a step that says several things is keyed by all of them', async () => {
  // A cell announces its name and then its text in one step. Keying on only
  // the last phrase would make two cells whose text matches look identical.
  const first = node('cell-one')
  const second = node('cell-two')
  const { log, finished } = await walk(
    reader([
      { node: first, says: ['gridcell, Thursday, September 10, 2026', '10'] },
      { node: second, says: ['gridcell, Saturday, October 10, 2026', '10'] },
    ]),
    400,
  )
  assert.equal(finished, true)
  assert.deepEqual(log, [
    'gridcell, Thursday, September 10, 2026',
    '10',
    'gridcell, Saturday, October 10, 2026',
    '10',
  ])
})
