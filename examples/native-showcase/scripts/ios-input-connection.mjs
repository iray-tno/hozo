import assert from 'node:assert/strict'

/** Cold CoreSimulator service discovery is setup, not a screenshot/UI read. */
export function discoverIosDevices(run) {
  const started = Date.now()
  const { devices } = JSON.parse(
    run('xcrun', ['simctl', 'list', 'devices', 'available', '--json'], 120_000).toString(),
  )
  assert.ok(devices && typeof devices === 'object', 'missing available simulator list')
  return { devices, elapsedMs: Date.now() - started }
}

/** Start the exact target's companion once, before any AX read or HID action. */
export function connectIosInput(udid, run) {
  const started = Date.now()
  const response = JSON.parse(
    run('idb', ['--log', 'DEBUG', 'connect', udid, '--json'], 120_000).toString(),
  )
  assert.equal(response.udid, udid, 'input companion connected to the wrong simulator')
  return { udid: response.udid, elapsedMs: Date.now() - started }
}
