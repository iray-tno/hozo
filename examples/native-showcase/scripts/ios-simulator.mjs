import assert from 'node:assert/strict'
import { discoverIosDevices } from './ios-input-connection.mjs'

/** Select once; an explicit UDID must never silently fall back to a namesake. */
export function selectIosSimulator(devices, { udid, name = 'iPhone 17' } = {}) {
  const candidates = Object.entries(devices)
    .filter(([runtime]) => runtime.includes('.iOS-'))
    .flatMap(([runtime, entries]) => entries.map((device) => ({ ...device, runtime })))
  const device = udid
    ? candidates.find((candidate) => candidate.udid === udid)
    : candidates.find((candidate) => candidate.name === name)
  assert.ok(device, 'requested iOS simulator is not available')
  return device
}

/** Begin cold OS setup before the native build, without waiting or restarting. */
export function prepareIosSimulator(run, selection, observation = {}) {
  const started = Date.now()
  Object.assign(observation, { startedAt: new Date(started).toISOString(), completed: false })
  try {
    const discovery = discoverIosDevices(run)
    const device = selectIosSimulator(discovery.devices, selection)
    Object.assign(observation, {
      device,
      deviceDiscoveryMs: discovery.elapsedMs,
      bootRequested: device.state === 'Shutdown',
    })
    if (device.state === 'Shutdown') {
      const command = ['simctl', 'boot', device.udid]
      observation.command = command
      observation.stdout = run('xcrun', command).toString()
    } else {
      assert.ok(['Booted', 'Booting'].includes(device.state), 'unexpected simulator state')
    }
    observation.completed = true
    return device
  } catch (error) {
    Object.assign(observation, {
      error: error.message,
      code: error.code,
      stdout: error.stdout?.toString(),
      stderr: error.stderr?.toString(),
    })
    throw error
  } finally {
    observation.elapsedMs = Date.now() - started
  }
}

/** Readiness remains mandatory, with the existing bounded budget and no retry. */
export function waitForIosBoot(udid, run, observation = {}) {
  const command = ['simctl', 'bootstatus', udid, '-b']
  const started = Date.now()
  Object.assign(observation, { command, completed: false })
  try {
    observation.stdout = run('xcrun', command, 180_000).toString()
    observation.completed = true
    return observation
  } catch (error) {
    Object.assign(observation, {
      error: error.message,
      code: error.code,
      stdout: error.stdout?.toString(),
      stderr: error.stderr?.toString(),
    })
    throw error
  } finally {
    observation.elapsedMs = Date.now() - started
  }
}
