import assert from 'node:assert/strict'
import test from 'node:test'
import { AndroidSystemUiUnresponsiveError, waitForAndroidControl } from './android-ui-wait.mjs'
import { parseNodes } from './device-evidence.mjs'

// Minimal uiautomator excerpt from failed run 38532959644/failure.xml.
const blocked = parseNodes(
  `<hierarchy rotation="0"><node text="System UI isn't responding" resource-id="android:id/alertTitle" package="android" bounds="[133,1064][947,1135]" /><node text="Close app" resource-id="android:id/aerr_close" package="android" bounds="[70,1174][1010,1300]" /><node text="Wait" resource-id="android:id/aerr_wait" package="android" bounds="[70,1300][1010,1426]" /></hierarchy>`,
)
const expected = { text: 'SVG filter: color', package: 'dev.hozo.showcase' }
const predicate = (node) => node.text === expected.text

test('System UI ANR fails immediately rather than becoming a missing SVG timeout', async () => {
  let reads = 0
  await assert.rejects(
    waitForAndroidControl(predicate, 'story svg-filter-pixels--color', {
      readNodes: () => {
        reads++
        return blocked
      },
      sleep: () => assert.fail('do not wait for or dismiss a blocking OS failure'),
    }),
    (error) => {
      assert.ok(error instanceof AndroidSystemUiUnresponsiveError)
      assert.equal(error.code, 'ANDROID_SYSTEM_UI_UNRESPONSIVE')
      assert.equal(error.blockingDialog.title, "System UI isn't responding")
      assert.deepEqual(error.blockingDialog.rect, [133, 1064, 947, 1135])
      return true
    },
  )
  assert.equal(reads, 1)
})

test('an expected control behind the OS dialog cannot count as successful delivery', async () => {
  await assert.rejects(
    waitForAndroidControl(predicate, 'SVG', { readNodes: () => [...blocked, expected] }),
    AndroidSystemUiUnresponsiveError,
  )
})

test('application text that resembles an ANR title is not a system alert', async () => {
  const tree = [{ ...blocked[0], package: 'dev.hozo.showcase' }, expected]
  assert.equal(await waitForAndroidControl(predicate, 'SVG', { readNodes: () => tree }), expected)
  assert.equal(
    await waitForAndroidControl(predicate, 'SVG', {
      readNodes: () => [{ ...blocked[0], 'resource-id': 'different-title' }, expected],
    }),
    expected,
  )
})

test('read-only reader retries retain the existing budget and do not resend input', async () => {
  let clock = 0
  let reads = 0
  const result = await waitForAndroidControl(predicate, 'SVG', {
    now: () => clock,
    sleep: async (ms) => {
      clock += ms
    },
    readNodes: () => {
      if (++reads < 3) throw new Error('reader unavailable')
      return [expected]
    },
  })
  assert.equal(result, expected)
  assert.equal(reads, 3)
  assert.equal(clock, 2_000)
})

test('missing UI retains the last reader error, instead of fabricated success or an OS diagnosis', async () => {
  let clock = 0
  const lastError = new Error('uiautomator failed')
  await assert.rejects(
    waitForAndroidControl(predicate, 'SVG', {
      timeout: 2_000,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms
      },
      readNodes: () => {
        throw lastError
      },
    }),
    (error) => {
      assert.equal(error.message, 'Timed out: SVG')
      assert.equal(error.cause, lastError)
      assert.equal(error.blockingDialog, undefined)
      return true
    },
  )
  assert.equal(clock, 2_000)
})
