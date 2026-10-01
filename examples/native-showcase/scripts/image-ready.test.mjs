import assert from 'node:assert/strict'
import test from 'node:test'
import { waitForImage } from './image-ready.mjs'

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
