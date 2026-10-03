import assert from 'node:assert/strict'
import test from 'node:test'
import { connectIosInput, discoverIosDevices } from './ios-input-connection.mjs'

test('cold simulator discovery gets a separate setup budget, not the UI budget', () => {
  const devices = { 'com.apple.CoreSimulator.SimRuntime.iOS-26-4': [{ udid: 'exact-udid' }] }
  const result = discoverIosDevices((command, args, timeout) => {
    assert.equal(command, 'xcrun')
    assert.deepEqual(args, ['simctl', 'list', 'devices', 'available', '--json'])
    assert.equal(timeout, 120_000)
    return Buffer.from(JSON.stringify({ devices }))
  })
  assert.deepEqual(result.devices, devices)
  assert.ok(result.elapsedMs >= 0)
  assert.throws(() => discoverIosDevices(() => Buffer.from('{}')), /missing available/)
})

test('companion setup targets the exact simulator without an AX read or HID action', () => {
  let calls = 0
  const result = connectIosInput('exact-udid', (command, args, timeout) => {
    calls++
    assert.equal(command, 'idb')
    assert.deepEqual(args, ['--log', 'DEBUG', 'connect', 'exact-udid', '--json'])
    assert.equal(timeout, 120_000)
    return Buffer.from(JSON.stringify({ udid: 'exact-udid', is_local: true }))
  })
  assert.equal(calls, 1)
  assert.equal(result.udid, 'exact-udid')
  assert.ok(result.elapsedMs >= 0)
})

test('a wrong companion or setup failure cannot fall through to interactions', () => {
  assert.throws(
    () => connectIosInput('wanted', () => Buffer.from('{"udid":"other"}')),
    /wrong simulator/,
  )
  const failure = new Error('connection failed')
  assert.throws(
    () =>
      connectIosInput('wanted', () => {
        throw failure
      }),
    (error) => error === failure,
  )
})
