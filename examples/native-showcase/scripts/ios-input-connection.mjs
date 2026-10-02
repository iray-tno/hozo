import assert from 'node:assert/strict'

/** Start the exact target's companion once, before any AX read or HID action. */
export function connectIosInput(udid, run) {
  const started = Date.now()
  const response = JSON.parse(
    run('idb', ['--log', 'DEBUG', 'connect', udid, '--json'], 120_000).toString(),
  )
  assert.equal(response.udid, udid, 'input companion connected to the wrong simulator')
  return { udid: response.udid, elapsedMs: Date.now() - started }
}
