import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { waitForIosControl } from './ios-ui-wait.mjs'

const target = { type: 'Button', AXLabel: 'Reset', rect: [40, 250, 362, 298] }
const prompt = [
  { AXLabel: 'Open in “Hozo Showcase”?' },
  { type: 'Button', AXLabel: 'Open', rect: [205, 450, 345, 498] },
]
const matches = (node) => node.AXLabel === 'Reset'

function schedule(trees, extra = {}) {
  let time = 0
  let reads = 0
  const taps = []
  const observation = {}
  return {
    taps,
    observation,
    reads: () => reads,
    elapsed: () => time,
    options: {
      readNodes: () => trees[Math.min(reads++, trees.length - 1)],
      tapConfirmation: (node) => taps.push(node),
      observation,
      now: () => time,
      sleep: async (ms) => {
        time += ms
      },
      ...extra,
    },
  }
}

test('full smoke exercises cold-start Buttons without a redundant deep link', () => {
  const driver = readFileSync(new URL('./ios-smoke.mjs', import.meta.url), 'utf8')
  const startup = readFileSync(new URL('../.rnstorybook/index.tsx', import.meta.url), 'utf8')
  assert.match(startup, /initialSelection: 'primitives-shared-showcase--buttons'/)
  const initialCounter = driver.slice(
    driver.indexOf("    if (evidence.scenario === 'full') {"),
    driver.indexOf("record('counter increments and resets')"),
  )
  assert.match(initialCounter, /await waitFor\(label\('Add one'\), 'initial Buttons story'\)/)
  assert.doesNotMatch(initialCounter, /\bstory\(/)
  assert.match(initialCounter, /await waitFor\(label\('Pressed 0 times'\)/)
  assert.match(initialCounter, /await tap\(label\('Add one'\)/)
  assert.match(initialCounter, /await tap\(label\('Reset'\)/)
  assert.match(driver, /return waitForIosControl\(predicate, description,/)
})

test('confirmation discards controls from its pre-tap snapshot and re-reads the app', async () => {
  const fresh = { ...target, rect: [50, 260, 372, 308] }
  const run = schedule([[...prompt, target], [fresh]], { allowOpenConfirmation: true })
  assert.equal(await waitForIosControl(matches, 'reset button', run.options), fresh)
  assert.equal(run.reads(), 2)
  assert.deepEqual(run.taps, [prompt[1]])
  assert.equal(run.observation.openConfirmations, 1)
})

test('a persistent confirmation neither retries its tap nor returns obscured controls', async () => {
  const run = schedule([[...prompt, target]], { timeout: 3_000, allowOpenConfirmation: true })
  await assert.rejects(waitForIosControl(matches, 'reset button', run.options), /Timed out/)
  assert.equal(run.taps.length, 1)
  assert.equal(run.elapsed(), 3_000)
  assert.equal(run.observation.openConfirmations, 1)
})

test('ordinary control waits never approve a late route confirmation', async () => {
  const run = schedule([[...prompt, target]], { timeout: 2_000 })
  await assert.rejects(waitForIosControl(matches, 'reset button', run.options), /Timed out/)
  assert.equal(run.taps.length, 0)
  assert.equal(run.observation.openConfirmations, undefined)
})

test('route waits never approve another application confirmation', async () => {
  const run = schedule([[{ AXLabel: 'Open in “Other App”?' }, prompt[1]]], {
    timeout: 2_000,
    allowOpenConfirmation: true,
  })
  await assert.rejects(waitForIosControl(matches, 'reset button', run.options), /Timed out/)
  assert.equal(run.taps.length, 0)
})

test('an ambiguous confirmation tap fails immediately without retry or success evidence', async () => {
  const failure = new Error('HID timeout')
  let attempts = 0
  const run = schedule([prompt, [target]], {
    allowOpenConfirmation: true,
    tapConfirmation: () => {
      attempts++
      throw failure
    },
  })
  await assert.rejects(
    waitForIosControl(matches, 'reset button', run.options),
    (error) => error === failure,
  )
  assert.equal(attempts, 1)
  assert.equal(run.reads(), 1)
  assert.equal(run.observation.openConfirmations, undefined)
})

test('only one confirmation extends the existing route budget; a missing target still fails', async () => {
  const run = schedule([[], prompt, []], { timeout: 3_000, allowOpenConfirmation: true })
  await assert.rejects(waitForIosControl(matches, 'reset button', run.options), /Timed out/)
  assert.equal(run.taps.length, 1)
  assert.equal(run.elapsed(), 4_000)
})

test('read failures retain their cause and do not cause input or an unbounded wait', async () => {
  const failure = new Error('AX unavailable')
  const run = schedule([], {
    timeout: 2_000,
    readNodes: () => {
      throw failure
    },
  })
  await assert.rejects(
    waitForIosControl(matches, 'reset button', run.options),
    (error) => error.cause === failure,
  )
  assert.equal(run.taps.length, 0)
  assert.equal(run.elapsed(), 2_000)
})
