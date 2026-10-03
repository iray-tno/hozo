import assert from 'node:assert/strict'
import test from 'node:test'
import { prepareIosSimulator, selectIosSimulator, waitForIosBoot } from './ios-simulator.mjs'

const ios26 = 'com.apple.CoreSimulator.SimRuntime.iOS-26-4'
const ios25 = 'com.apple.CoreSimulator.SimRuntime.iOS-25-0'
const devices = (state = 'Shutdown') => ({
  [ios25]: [{ udid: 'older-udid', name: 'iPhone 17', state }],
  [ios26]: [{ udid: 'exact-udid', name: 'iPhone 17', state }],
  'com.apple.CoreSimulator.SimRuntime.tvOS-26-4': [
    { udid: 'other-platform', name: 'iPhone 17', state },
  ],
})

test('simulator selection preserves explicit UDID across duplicate runtime names', () => {
  assert.equal(selectIosSimulator(devices(), { udid: 'exact-udid' }).runtime, ios26)
  assert.equal(selectIosSimulator(devices()).udid, 'older-udid')
  assert.throws(() => selectIosSimulator(devices(), { udid: 'absent' }), /not available/)
  assert.throws(() => selectIosSimulator(devices(), { udid: 'other-platform' }), /not available/)
})

test('early preparation starts exactly one boot without waiting, installing or input', () => {
  const calls = []
  const observation = {}
  const selected = prepareIosSimulator(
    (command, args, timeout) => {
      calls.push({ command, args, timeout })
      return Buffer.from(args[1] === 'list' ? JSON.stringify({ devices: devices() }) : '')
    },
    { udid: 'exact-udid' },
    observation,
  )
  assert.equal(selected.udid, 'exact-udid')
  assert.deepEqual(calls, [
    {
      command: 'xcrun',
      args: ['simctl', 'list', 'devices', 'available', '--json'],
      timeout: 120_000,
    },
    { command: 'xcrun', args: ['simctl', 'boot', 'exact-udid'], timeout: undefined },
  ])
  assert.equal(observation.completed, true)
  assert.equal(observation.bootRequested, true)
})

test('an already booting or booted exact simulator is never restarted', () => {
  for (const state of ['Booted', 'Booting']) {
    let calls = 0
    const observation = {}
    prepareIosSimulator(
      () => {
        calls++
        return Buffer.from(JSON.stringify({ devices: devices(state) }))
      },
      { udid: 'exact-udid' },
      observation,
    )
    assert.equal(calls, 1)
    assert.equal(observation.bootRequested, false)
  }
})

test('boot readiness still checks the exact simulator once with the original budget', () => {
  let calls = 0
  const observation = waitForIosBoot('exact-udid', (command, args, timeout) => {
    calls++
    assert.equal(command, 'xcrun')
    assert.deepEqual(args, ['simctl', 'bootstatus', 'exact-udid', '-b'])
    assert.equal(timeout, 180_000)
    return Buffer.from('Finished')
  })
  assert.equal(calls, 1)
  assert.equal(observation.completed, true)
  assert.equal(observation.stdout, 'Finished')
})

test('boot timeout retains the full OS progress output and fails without retry', () => {
  const failure = Object.assign(new Error('boot timed out'), {
    code: 'ETIMEDOUT',
    stdout: Buffer.from('Waiting on Data Migration\nStill waiting'),
    stderr: Buffer.from('boot diagnostic'),
  })
  let calls = 0
  const observation = {}
  assert.throws(
    () =>
      waitForIosBoot(
        'exact-udid',
        () => {
          calls++
          throw failure
        },
        observation,
      ),
    (error) => error === failure,
  )
  assert.equal(calls, 1)
  assert.equal(observation.completed, false)
  assert.equal(observation.code, 'ETIMEDOUT')
  assert.equal(observation.stdout, failure.stdout.toString())
  assert.equal(observation.stderr, failure.stderr.toString())
})
