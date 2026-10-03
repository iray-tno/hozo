import assert from 'node:assert/strict'
import test from 'node:test'
import { observeLateImage, PresentedImageTimeout, waitForImage } from './image-ready.mjs'

test('cold GL captures wait for pixels, while a permanently blank Canvas fails', async () => {
  let time = 0
  const clock = {
    timeout: 200,
    interval: 100,
    now: () => time,
    sleep: async (delay) => {
      time += delay
    },
  }
  let captures = 0
  const ready = { colours: 40 }
  assert.equal(
    await waitForImage(
      () => (++captures === 1 ? { colours: 1 } : ready),
      (image) => image.colours >= 40,
      'first frame',
      clock,
    ),
    ready,
  )
  assert.equal(captures, 2)
  captures = 0
  await assert.rejects(
    waitForImage(
      () => {
        captures++
        return { colours: 1 }
      },
      (image) => image.colours >= 40,
      'first frame',
      clock,
    ),
    /presented Canvas pixels: first frame/,
  )
  assert.equal(captures, 3)
})

test('capture errors fail immediately; interactions are not retried', async () => {
  let captures = 0
  await assert.rejects(
    waitForImage(
      () => {
        captures++
        throw new Error('device disconnected')
      },
      () => true,
      'first frame',
    ),
    /device disconnected/,
  )
  assert.equal(captures, 1)
})

test('late pixels are diagnostic observations, not acceptance within the original deadline', async () => {
  let time = 0
  const clock = {
    now: () => time,
    sleep: async (delay) => {
      time += delay
    },
    interval: 100,
  }
  const read = () => ({ difference: time >= 500 ? 0.73 : 0 })
  const accept = (image) => image.difference >= 0.01
  let original
  try {
    await waitForImage(read, accept, 'canonical frame', { ...clock, timeout: 200 })
  } catch (error) {
    original = error
  }
  assert.ok(original instanceof PresentedImageTimeout)
  const late = await observeLateImage(read, accept, { ...clock, timeout: 500 })
  assert.equal(late.observed, true)
  assert.equal(late.elapsedMs, 300)
  assert.equal(late.observation.difference, 0.73)
  assert.equal(late.passed, undefined)
  assert.equal(original.message, 'Timed out waiting for presented Canvas pixels: canonical frame')
})

test('a permanent freeze and diagnostic capture errors remain failed observations', async () => {
  let time = 0
  const clock = {
    timeout: 200,
    interval: 100,
    now: () => time,
    sleep: async (delay) => {
      time += delay
    },
  }
  const frozen = await observeLateImage(
    () => ({ difference: 0 }),
    () => false,
    clock,
  )
  assert.equal(frozen.observed, false)
  assert.equal(frozen.captures, 3)
  assert.match(frozen.error, /post-failure diagnostic only/)
  const failed = await observeLateImage(
    () => {
      throw new Error('device disconnected')
    },
    () => true,
  )
  assert.equal(failed.observed, false)
  assert.equal(failed.captures, 1)
  assert.match(failed.error, /device disconnected/)
})
