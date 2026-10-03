import assert from 'node:assert/strict'
import test from 'node:test'
import { PresentedImageTimeout } from './image-ready.mjs'
import { IOS_SCENE_IMAGE_TIMEOUT, waitForIosSceneImage } from './ios-image-ready.mjs'

test('iOS scene presentation waits for actual delayed pixels and reports latency', async () => {
  let time = 0
  let reads = 0
  const result = await waitForIosSceneImage(
    () => {
      reads++
      return { difference: time < 210_000 ? 0 : 0.73 }
    },
    (image) => image.difference >= 0.01,
    'disassembled frame',
    {
      now: () => time,
      interval: 30_000,
      sleep: async (delay) => {
        time += delay
      },
    },
  )
  assert.equal(result.image.difference, 0.73)
  assert.equal(result.presentedAfterMs, 210_000)
  assert.equal(reads, 8)
  assert.equal(IOS_SCENE_IMAGE_TIMEOUT, 300_000)
})

test('a blank/unchanged iOS scene still fails; capture errors do not retry an input', async () => {
  let time = 0
  const clock = {
    now: () => time,
    interval: 30_000,
    sleep: async (delay) => {
      time += delay
    },
  }
  await assert.rejects(
    waitForIosSceneImage(
      () => ({ difference: 0 }),
      (image) => image.difference >= 0.01,
      'frozen',
      clock,
    ),
    PresentedImageTimeout,
  )
  assert.equal(time, IOS_SCENE_IMAGE_TIMEOUT)
  let reads = 0
  await assert.rejects(
    waitForIosSceneImage(
      () => {
        reads++
        throw new Error('capture failed')
      },
      () => true,
      'capture',
    ),
    /capture failed/,
  )
  assert.equal(reads, 1)
})
