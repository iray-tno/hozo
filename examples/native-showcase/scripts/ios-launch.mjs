import assert from 'node:assert/strict'

/** One launch of the just-installed app; UI readiness is a separate assertion. */
export function launchIosApp(udid, app, run, observation = {}) {
  const command = ['simctl', 'launch', udid, app]
  const started = Date.now()
  Object.assign(observation, { command, completed: false })
  try {
    // A cold dedicated simulator has no app session to terminate. Avoid adding
    // a synchronous termination round-trip to the launch service, and never
    // retry a launch that may already have reached the device.
    const output = run('xcrun', command, 120_000).toString().trim()
    observation.output = output
    const [bundleId, pidText] = output.split(/:\s+/)
    assert.equal(bundleId, app, 'launch returned the wrong application')
    assert.ok(/^[1-9]\d*$/.test(pidText ?? ''), 'launch did not return an application PID')
    observation.pid = Number(pidText)
    observation.completed = true
    return observation
  } catch (error) {
    observation.error = error.message
    observation.code = error.code
    throw error
  } finally {
    observation.elapsedMs = Date.now() - started
  }
}
