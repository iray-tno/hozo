import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createReadiness,
  EXPECTED_SCENARIOS,
  validateCompletion,
} from './shared-showcase-readiness.mjs'

test('paused metadata readiness does not require decoded frames or start playback', () => {
  const readiness = createReadiness({}, { deadline: 100 })
  const media = {
    currentSrc: 'fixture.mp4',
    readyState: 1,
    paused: true,
    currentTime: 0,
    play() {
      assert.fail('metadata must not warm up playback')
    },
    addEventListener() {
      assert.fail('metadata must not wait for canplay or loadeddata')
    },
  }
  assert.equal(readiness.metadataReady(media), true)
  assert.equal(media.paused, true)
  assert.equal(media.currentTime, 0)
  assert.equal(readiness.metadataReady({ ...media, currentSrc: '' }), false)
  assert.equal(readiness.metadataReady({ ...media, readyState: 0 }), false)
  assert.equal(readiness.metadataReady(null), false)
  assert.throws(
    () => readiness.metadataReady({ ...media, error: { code: 4, message: 'unsupported source' } }),
    /unsupported source/,
  )
})

test('initial cover readiness belongs to the image, not a decoded video frame', () => {
  const { coverReady } = createReadiness({}, { deadline: 100 })
  assert.equal(coverReady({ complete: true, naturalWidth: 320 }), true)
  assert.equal(coverReady({ complete: false, naturalWidth: 320 }), false)
  assert.equal(coverReady({ complete: true, naturalWidth: 0 }), false)
  assert.equal(coverReady({ complete: true, naturalWidth: 640 }), false)
  assert.equal(coverReady(null), false)
})

test('metadata does not authorize a disabled seek; dispatch once after the rendered control enables', async () => {
  let time = 0
  let clicks = 0
  const control = {
    textContent: '',
    getAttribute: (name) => (name === 'aria-label' ? 'Seek forward 1 second' : null),
    matches: () => time < 300,
    click: () => {
      assert.equal(time, 300)
      clicks++
    },
  }
  const readiness = createReadiness(
    { contentDocument: { querySelectorAll: () => [control] } },
    {
      deadline: 1000,
      now: () => time,
      delay: async () => {
        time += 100
      },
    },
  )
  assert.equal(readiness.metadataReady({ currentSrc: 'fixture.mp4', readyState: 1 }), true)
  await readiness.clickEnabled('Seek forward 1 second')
  assert.equal(clicks, 1)
})

test('a never-enabled or aria-disabled control times out without dispatch or retries', async () => {
  for (const ariaDisabled of [false, true]) {
    let time = 0
    const readiness = createReadiness(
      {
        contentDocument: {
          querySelectorAll: () => [
            {
              textContent: '',
              getAttribute: (name) =>
                name === 'aria-label' ? 'Seek' : ariaDisabled ? 'true' : null,
              matches: () => !ariaDisabled,
              click: () => assert.fail('must not dispatch to an unavailable control'),
            },
          ],
        },
      },
      {
        deadline: 100,
        now: () => time,
        delay: async () => {
          time = 100
        },
      },
    )
    await assert.rejects(
      readiness.clickEnabled('Seek'),
      /Timed out waiting for enabled control Seek/,
    )
  }
})

test('wait observes delayed authored controls and rejects a stale story document', async () => {
  let time = 0
  const control = { getAttribute: () => 'Email notifications', textContent: '' }
  const frame = {
    contentDocument: {
      URL: 'http://fixture/iframe.html?id=previous',
      readyState: 'complete',
      querySelectorAll: () => [control],
    },
  }
  const stages = []
  const readiness = createReadiness(frame, {
    deadline: 1000,
    now: () => time,
    onStage: (stage) => stages.push(stage),
    delay: async () => {
      time += 100
      if (time === 300) {
        frame.contentDocument.URL = 'http://fixture/iframe.html?id=preferences'
        frame.contentDocument.readyState = 'loading'
      }
      if (time === 500) frame.contentDocument.readyState = 'complete'
    },
  })
  const result = await readiness.wait(
    () =>
      readiness.storyReady('preferences', () =>
        readiness.find('[role=checkbox]', 'Email notifications'),
      ),
    'authored preferences control',
  )
  assert.equal(result, control)
  assert.equal(time, 500)
  assert.deepEqual(stages, ['authored preferences control'])
})

test('wait cannot accept late success or hide a predicate error', async () => {
  let time = 0
  const { wait } = createReadiness(
    {},
    {
      deadline: 100,
      now: () => time,
      delay: async () => {
        time = 100
      },
    },
  )
  await assert.rejects(
    wait(() => time === 100, 'caption'),
    /Timed out waiting for caption/,
  )
  time = 0
  await assert.rejects(
    wait(() => {
      throw new Error('decoder failure')
    }, 'metadata'),
    /decoder failure/,
  )
})

test('negative assertions cross both render turns before checking unchanged state', async (context) => {
  const callbacks = []
  let observedMs = null
  const original = Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame')
  globalThis.requestAnimationFrame = (callback) => callbacks.push(callback)
  context.after(() => {
    if (original) Object.defineProperty(globalThis, 'requestAnimationFrame', original)
    else delete globalThis.requestAnimationFrame
  })
  const { settle } = createReadiness(
    {},
    {
      deadline: 1000,
      delay: async (ms) => {
        observedMs = ms
      },
    },
  )
  let settled = false
  const pending = settle().then(() => {
    settled = true
  })
  assert.equal(callbacks.length, 1)
  callbacks.shift()()
  await Promise.resolve()
  assert.equal(settled, false)
  assert.equal(callbacks.length, 1)
  callbacks.shift()()
  await pending
  assert.equal(settled, true)
  assert.equal(observedMs, 250)
})

test('only explicit success of all nine distinct ordered scenarios completes the check', () => {
  const success = { state: 'passed', passed: [...EXPECTED_SCENARIOS] }
  assert.equal(validateCompletion(success), success)
  assert.throws(() => validateCompletion(null), /did not complete/)
  assert.throws(() => validateCompletion({ ...success, state: 'running' }), /did not complete/)
  assert.throws(
    () => validateCompletion({ ...success, state: 'failed', error: 'missing control' }),
    /missing control/,
  )
  assert.throws(
    () => validateCompletion({ ...success, error: 'decoder failure' }),
    /decoder failure/,
  )
  assert.throws(
    () => validateCompletion({ ...success, passed: success.passed.slice(0, 8) }),
    /all nine/,
  )
  assert.throws(
    () => validateCompletion({ ...success, passed: Array(9).fill(EXPECTED_SCENARIOS[0]) }),
    /all nine/,
  )
  assert.throws(
    () => validateCompletion({ ...success, passed: success.passed.toReversed() }),
    /all nine/,
  )
  assert.throws(
    () => validateCompletion(success, ['unhandled render error']),
    /unhandled render error/,
  )
})
