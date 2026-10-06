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
  const run = schedule([[...prompt, target], [...prompt, target], [fresh]], {
    allowOpenConfirmation: true,
  })
  assert.equal(await waitForIosControl(matches, 'reset button', run.options), fresh)
  assert.equal(run.reads(), 3)
  assert.deepEqual(run.taps, [prompt[1]])
  assert.equal(run.observation.openConfirmations, 1)
  assert.equal(run.observation.routeConfirmations[0].tapStartedAt, 1_000)
  assert.equal(run.observation.routeConfirmations[0].dismissedAt, 2_000)
})

test('an animated OS confirmation is observed until its position settles before a single tap', async () => {
  const moving = [prompt[0], { ...prompt[1], rect: [205, 480, 345, 528] }]
  const run = schedule([moving, prompt, prompt, [target]], { allowOpenConfirmation: true })
  assert.equal(await waitForIosControl(matches, 'reset button', run.options), target)
  assert.deepEqual(run.taps, [prompt[1]])
  assert.equal(run.observation.routeConfirmations[0].samples.length, 3)
  assert.equal(run.observation.routeConfirmations[0].tapStartedAt, 2_000)
})

test('separate routes each handle one confirmation with their own evidence, not a global tap limit', async () => {
  const run = schedule([prompt, prompt, [target], prompt, prompt, [target]], {
    allowOpenConfirmation: true,
  })
  await waitForIosControl(matches, 'first route', run.options)
  await waitForIosControl(matches, 'second route', run.options)
  assert.equal(run.observation.openConfirmations, 2)
  assert.deepEqual(
    run.observation.routeConfirmations.map((entry) => entry.description),
    ['first route', 'second route'],
  )
})

test('a persistent confirmation neither retries its tap nor returns obscured controls', async () => {
  const run = schedule([[...prompt, target]], { timeout: 3_000, allowOpenConfirmation: true })
  await assert.rejects(waitForIosControl(matches, 'reset button', run.options), /Timed out/)
  assert.equal(run.taps.length, 1)
  assert.equal(run.elapsed(), 4_000)
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
  const run = schedule([prompt, prompt, [target]], {
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
  assert.equal(run.reads(), 2)
  assert.equal(run.observation.openConfirmations, undefined)
})

test('only one confirmation extends the existing route budget; a missing target still fails', async () => {
  const run = schedule([[], prompt, prompt, []], { timeout: 3_000, allowOpenConfirmation: true })
  await assert.rejects(waitForIosControl(matches, 'reset button', run.options), /Timed out/)
  assert.equal(run.taps.length, 1)
  assert.equal(run.elapsed(), 5_000)
})

test('an unsettled confirmation never taps or extends the route deadline', async () => {
  const moving = Array.from({ length: 4 }, (_, index) => [
    prompt[0],
    { ...prompt[1], rect: [205, 450 + index * 10, 345, 498 + index * 10] },
  ])
  const run = schedule(moving, { timeout: 3_000, allowOpenConfirmation: true })
  await assert.rejects(waitForIosControl(matches, 'reset button', run.options), /Timed out/)
  assert.equal(run.taps.length, 0)
  assert.equal(run.elapsed(), 3_000)
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
