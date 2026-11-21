import assert from 'node:assert/strict'
import test from 'node:test'
import { exerciseIosPreferences } from './ios-preferences-evidence.mjs'

function tree(email = false, updates = true, requiredEnabled = false) {
  return [
    {
      AXLabel: 'Email notifications',
      AXValue: email ? 'checkbox, checked' : 'checkbox',
      rect: [40, 146, 362, 194],
      enabled: true,
      children: [{ AXLabel: `Email notifications: ${email ? 'enabled' : 'disabled'}` }],
    },
    {
      AXLabel: 'Automatic updates',
      AXValue: updates ? '1' : '0',
      role: 'AXCheckBox',
      subrole: 'AXSwitch',
      rect: [40, 210, 362, 258],
      enabled: true,
    },
    {
      AXLabel: 'Required security notices',
      AXValue: 'checkbox, checked',
      rect: [40, 275, 362, 323],
      enabled: requiredEnabled,
    },
    { AXLabel: `Preferences: email ${email ? 'on' : 'off'}, updates ${updates ? 'on' : 'off'}` },
  ]
}

function driver(trees, extra = {}) {
  let time = 0
  let reads = 0
  const observation = {}
  const events = []
  return {
    observation,
    events,
    options: {
      observation,
      now: () => time,
      sleep: async (ms) => {
        time += ms
      },
      timeout: 3_000,
      readNodes: () => {
        events.push('read')
        time += 10
        const next = trees[Math.min(reads++, trees.length - 1)]
        if (next instanceof Error) throw next
        return next
      },
      tapPoint: (point) => {
        events.push(point)
        time += 20
      },
      ...extra,
    },
  }
}

test('retains surrounding AX state and HID timing without inserting reads or changing tap order', async () => {
  const run = driver([tree(), tree(true), tree(true, false)])
  await exerciseIosPreferences(run.options)
  assert.deepEqual(run.events, [
    'read',
    [201, 170],
    'read',
    [201, 234],
    'read',
    'read',
    'read',
    [201, 299],
    'read',
  ])
  const { actions, samples } = run.observation
  assert.equal(run.observation.passed, true)
  assert.equal(run.observation.resultSample, 2)
  assert.equal(run.observation.disabledResultSample, 5)
  assert.deepEqual(
    actions.map((action) => action.beforeSample),
    [0, 1, 4],
  )
  assert.deepEqual(
    actions.map((action) => action.afterSample),
    [1, 2, 5],
  )
  assert.equal(samples[1].nodes[0].AXValue, 'checkbox, checked')
  assert.equal(samples[1].nodes[1].AXValue, '1')
  assert.equal(samples[2].nodes[1].AXValue, '0')
  assert.equal(samples[1].nodes[0].children, undefined)
  assert.deepEqual(samples[1].nodes[1].rect, [40, 210, 362, 258])
  assert.ok(
    actions.every(
      (action) => action.commandReturned && action.completedAt - action.startedAt === 20,
    ),
  )
  assert.ok(samples.every((sample) => sample.completedAt - sample.startedAt === 10))
})

test('a returned HID command with unchanged app state fails without repeating input', async () => {
  const axFailure = Object.assign(new Error('AX service did not answer'), { code: 'ETIMEDOUT' })
  const run = driver([tree(), tree(true), axFailure, tree(true)])
  await assert.rejects(exerciseIosPreferences(run.options), /Timed out: preference state changes/)
  const { actions, samples } = run.observation
  assert.equal(run.observation.passed, false)
  assert.equal(run.observation.resultSample, undefined)
  assert.equal(actions.length, 2)
  assert.equal(actions[1].commandReturned, true)
  assert.equal(actions[1].afterSample, 3)
  assert.equal(samples[2].error.code, 'ETIMEDOUT')
  assert.equal(samples[2].nodes, undefined)
  assert.equal(samples[3].nodes[1].AXValue, '1')
  assert.equal(samples.at(-1).nodes[3].AXLabel, 'Preferences: email on, updates on')
})

test('ambiguous HID failure retains the attempted point and duration and never sends another tap', async () => {
  const failure = Object.assign(new Error('HID timed out'), { signal: 'SIGTERM', status: null })
  const run = driver([tree()], {
    tapPoint: () => {
      throw failure
    },
  })
  await assert.rejects(exerciseIosPreferences(run.options), (error) => error === failure)
  assert.equal(run.observation.actions.length, 1)
  const [action] = run.observation.actions
  assert.deepEqual(action.point, [201, 170])
  assert.equal(action.commandReturned, false)
  assert.equal(action.error.signal, 'SIGTERM')
  assert.equal(action.afterSample, undefined)
  assert.equal(typeof action.completedAt, 'number')
  assert.equal(run.observation.passed, false)
  assert.deepEqual(run.events, ['read'])
})

test('a later state observation can pass after an AX error without repeating either toggle', async () => {
  const run = driver([tree(), tree(true), new Error('AX busy'), tree(true), tree(true, false)])
  await exerciseIosPreferences(run.options)
  assert.equal(run.observation.passed, true)
  assert.equal(run.observation.resultSample, 4)
  assert.equal(run.observation.actions.length, 3)
  assert.equal(run.observation.actions[1].afterSample, 3)
  assert.equal(run.observation.samples[3].nodes[1].AXValue, '1')
  assert.equal(run.observation.samples[4].nodes[1].AXValue, '0')
})

test('a missing initial control records AX errors but cannot produce an input action', async () => {
  const failure = new Error('AX read failed')
  const run = driver([failure])
  await assert.rejects(exerciseIosPreferences(run.options), (error) => error.cause === failure)
  assert.equal(run.observation.actions.length, 0)
  assert.ok(
    run.observation.samples.every((sample) => sample.error.message.includes('AX read failed')),
  )
})

test('a changed Switch AXValue alone cannot replace the expected app summary', async () => {
  const inconsistent = tree(true, false)
  inconsistent[3].AXLabel = 'Preferences: email on, updates on'
  const run = driver([tree(), tree(true), inconsistent])
  await assert.rejects(exerciseIosPreferences(run.options), /Timed out: preference state changes/)
  assert.equal(run.observation.actions.length, 2)
  assert.equal(run.observation.passed, false)
})

test('an enabled required checkbox fails before its disabled-control tap', async () => {
  const run = driver([tree(), tree(true), tree(true, false, true)])
  await assert.rejects(exerciseIosPreferences(run.options), /required checkbox must be disabled/)
  assert.equal(run.observation.actions.length, 2)
  assert.equal(run.observation.passed, false)
})

test('an obscuring OS confirmation prevents tapping even if the target is present', async () => {
  const run = driver([
    [
      { AXLabel: 'Open in “Hozo Showcase”?' },
      { type: 'Button', AXLabel: 'Open', rect: [205, 450, 345, 498] },
      ...tree(),
    ],
  ])
  await assert.rejects(exerciseIosPreferences(run.options), /Timed out: email checkbox/)
  assert.equal(run.observation.actions.length, 0)
})
