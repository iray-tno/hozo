import assert from 'node:assert/strict'
import { centre } from './device-evidence.mjs'
import { waitForIosControl } from './ios-ui-wait.mjs'

const label = (text) => (node) => node.AXLabel?.replace(/\s+/g, ' ').trim() === text
const failure = (error) => ({
  message: String(error),
  code: error.code,
  status: error.status,
  signal: error.signal,
})

// Preserve the original input/read sequence: observing each toggle separately
// would add an AX wait between taps and could hide the race being investigated.
export async function exerciseIosPreferences({
  readNodes,
  tapPoint,
  observation,
  now = Date.now,
  sleep,
  timeout = 60_000,
}) {
  Object.assign(observation, { samples: [], actions: [], passed: false })

  async function wait(text, description) {
    observation.phase = description
    const node = await waitForIosControl(label(text), description, {
      readNodes: () => {
        const sample = { phase: description, startedAt: now() }
        observation.samples.push(sample)
        try {
          const tree = readNodes()
          // The parser already flattened children. Keep the original AX fields
          // without repeatedly serializing their nested copies in every parent.
          sample.nodes = tree.map(({ children: _children, ...node }) => node)
          const action = observation.actions.at(-1)
          if (action && action.afterSample === undefined) {
            action.afterSample = observation.samples.length - 1
          }
          return tree
        } catch (error) {
          sample.error = failure(error)
          throw error
        } finally {
          sample.completedAt = now()
        }
      },
      observation,
      now,
      sleep,
      timeout,
    })
    observation.samples.at(-1).matched = text
    return node
  }

  async function tap(text, description) {
    const node = await wait(text, description)
    const action = {
      label: text,
      beforeSample: observation.samples.length - 1,
      point: centre(node),
      startedAt: now(),
    }
    observation.actions.push(action)
    observation.phase = `tap ${description}`
    try {
      await tapPoint(action.point)
      // Command completion is not proof that UIKit/React consumed the gesture.
      action.commandReturned = true
    } catch (error) {
      action.commandReturned = false
      action.error = failure(error)
      throw error
    } finally {
      action.completedAt = now()
    }
  }

  await tap('Email notifications', 'email checkbox')
  await tap('Automatic updates', 'updates switch')
  await wait('Preferences: email on, updates off', 'preference state changes')
  observation.resultSample = observation.samples.length - 1
  const required = await wait('Required security notices', 'required checkbox')
  assert.equal(required.enabled, false, 'required checkbox must be disabled')
  await tap('Required security notices', 'disabled required checkbox')
  await wait('Preferences: email on, updates off', 'disabled preference unchanged')
  observation.disabledResultSample = observation.samples.length - 1
  observation.passed = true
}
