import assert from 'node:assert/strict'
import test from 'node:test'
import { launchIosApp } from './ios-launch.mjs'

test('fresh app launch targets the exact device once, without an unnecessary termination', () => {
  let calls = 0
  const observation = {}
  const result = launchIosApp(
    'exact-udid',
    'dev.hozo.showcase',
    (command, args, timeout) => {
      calls++
      assert.equal(command, 'xcrun')
      assert.deepEqual(args, ['simctl', 'launch', 'exact-udid', 'dev.hozo.showcase'])
      assert.equal(timeout, 120_000)
      return Buffer.from('dev.hozo.showcase: 1234\n')
    },
    observation,
  )
  assert.equal(calls, 1)
  assert.equal(result, observation)
  assert.equal(result.pid, 1234)
  assert.equal(result.completed, true)
  assert.ok(result.elapsedMs >= 0)
})

test('a launch timeout preserves its evidence and cannot be retried into a pass', () => {
  const failure = Object.assign(new Error('launch timeout'), { code: 'ETIMEDOUT' })
  const observation = {}
  let calls = 0
  assert.throws(
    () =>
      launchIosApp(
        'wanted',
        'app',
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
  assert.equal(observation.error, 'launch timeout')
  assert.ok(observation.elapsedMs >= 0)
})

test('a wrong app, missing PID, or malformed response is not launch success', () => {
  for (const output of ['other: 1234', 'app: 0', 'app: unknown', 'app: 12\nother: 34', '']) {
    const observation = {}
    assert.throws(() => launchIosApp('wanted', 'app', () => Buffer.from(output), observation))
    assert.equal(observation.completed, false)
  }
})
