import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import React, { act } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { create } from 'react-test-renderer'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const require = createRequire(import.meta.url)
const entries = new Map()
const vtt = (text) => `WEBVTT\n\n00:00.000 --> 00:02.000\n${text}`
const deferred = () => {
  let resolve
  let reject
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

function entry(native) {
  if (!entries.has(native))
    entries.set(
      native,
      (async () => {
        const result = await build({
          entryPoints: [
            fileURLToPath(
              new URL(`../src/captions-index${native ? '.native' : ''}.ts`, import.meta.url),
            ),
          ],
          bundle: true,
          write: false,
          platform: 'node',
          format: 'cjs',
          packages: 'external',
        })
        const module = { exports: {} }
        new Function('require', 'module', 'exports', result.outputFiles[0].text)(
          (name) =>
            name === 'react-native'
              ? { View: 'RNView', Text: 'RNText' }
              : /expo-/.test(name)
                ? assert.fail('loading captions must not import a playback engine')
                : require(name),
          module,
          module.exports,
        )
        return module.exports
      })(),
    )
  return entries.get(native)
}

async function harness(t, native, initial, strict = false) {
  const { useWebVTTCaptions, MediaCaptions } = await entry(native)
  const observations = []
  function Probe(props) {
    const result = useWebVTTCaptions(props)
    observations.push(result)
    return React.createElement(MediaCaptions, {
      src: result.mediaSrc,
      status: {
        src: props.mediaSrc,
        status: 'ready',
        playing: false,
        buffering: false,
        currentTime: 0,
        duration: 2,
        error: null,
      },
      cues: result.cues,
      accessibilityLabel: 'Loaded captions',
    })
  }
  const render = (props) =>
    strict
      ? React.createElement(React.StrictMode, null, React.createElement(Probe, props))
      : React.createElement(Probe, props)
  let renderer
  await act(async () => {
    renderer = create(render(initial))
  })
  t.after(async () => act(async () => renderer.unmount()))
  return {
    observations,
    get last() {
      return observations.at(-1)
    },
    get text() {
      return JSON.stringify(renderer.toJSON())
    },
    update: async (props) => act(async () => renderer.update(render(props))),
    unmount: async () => act(async () => renderer.unmount()),
  }
}

for (const native of [false, true]) {
  const host = native ? 'Native' : 'Web'
  test(`${host} caption loading binds to media and track, ignores late results, and clears before effects`, async (t) => {
    const requests = []
    const loadText = (src, signal) => {
      const pending = { src, signal, ...deferred() }
      requests.push(pending)
      return pending.promise
    }
    const a = { mediaSrc: 'a.mp4', trackSrc: 'shared.vtt', loadText }
    const b = { ...a, mediaSrc: 'b.mp4' }
    const probe = await harness(t, native, a)
    assert.equal(probe.last.status, 'loading')
    assert.deepEqual(probe.last.cues, [])
    await probe.update(b)
    assert.equal(requests[0].signal.aborted, true)
    await act(async () => requests[1].resolve(vtt('B captions')))
    assert.match(probe.text, /B captions/)
    await act(async () => requests[0].resolve('invalid old track'))
    assert.equal(probe.last.status, 'ready')
    assert.equal(probe.last.error, null)
    assert.equal(probe.last.mediaSrc, 'b.mp4')
    assert.match(probe.text, /B captions/)
    const nextRender = probe.observations.length
    await probe.update(a)
    assert.equal(probe.observations[nextRender].status, 'loading')
    assert.deepEqual(probe.observations[nextRender].cues, [])
    assert.equal(probe.text, 'null')
    await act(async () => requests[2].resolve(vtt('Fresh A captions')))
    assert.match(probe.text, /Fresh A captions/)
    await probe.update({ ...a, trackSrc: 'other-language.vtt' })
    assert.equal(probe.last.status, 'loading')
    assert.equal(probe.text, 'null')
    await act(async () => requests[3].resolve(vtt('Other language')))
    assert.match(probe.text, /Other language/)
  })

  test(`${host} deselection, disable, loader changes and unmount retire pending requests`, async (t) => {
    const pending = []
    const loadText = (_src, signal) => {
      const request = { signal, ...deferred() }
      pending.push(request)
      return request.promise
    }
    const options = { mediaSrc: 'a.wav', trackSrc: 'a.vtt', loadText }
    const probe = await harness(t, native, { ...options, trackSrc: null })
    assert.equal(probe.last.status, 'idle')
    assert.equal(pending.length, 0)
    await probe.update({ ...options, enabled: false })
    assert.equal(probe.last.status, 'idle')
    assert.equal(pending.length, 0)
    await probe.update(options)
    await probe.update({ ...options, enabled: false })
    assert.equal(pending[0].signal.aborted, true)
    await act(async () => pending[0].reject(new Error('late network failure')))
    assert.equal(probe.last.status, 'idle')
    assert.equal(probe.last.error, null)
    await probe.update(options)
    await act(async () => pending[1].resolve(vtt('Enabled again')))
    assert.match(probe.text, /Enabled again/)
    await probe.update({ ...options, loadText: async () => vtt('New loader') })
    assert.match(probe.text, /New loader/)
    await probe.update(options)
    await probe.update({ ...options, trackSrc: null })
    assert.equal(pending[2].signal.aborted, true)
    await act(async () => pending[2].resolve(vtt('Deselected result')))
    assert.equal(probe.last.status, 'idle')
    assert.equal(probe.text, 'null')
    await probe.update(options)
    await probe.unmount()
    assert.equal(pending[3].signal.aborted, true)
    const count = probe.observations.length
    await act(async () => pending[3].reject(new Error('after unmount')))
    assert.equal(probe.observations.length, count)
  })

  test(`${host} returning to a previous source or retrying it never resurrects cached captions`, async (t) => {
    const requests = []
    const loadText = (_src, signal) => {
      const request = { signal, ...deferred() }
      requests.push(request)
      return request.promise
    }
    const options = { mediaSrc: 'a.mp4', trackSrc: 'a.vtt', loadText }
    const probe = await harness(t, native, options)
    await act(async () => requests[0].resolve(vtt('First A result')))
    const count = requests.length
    await probe.update({ ...options })
    assert.equal(requests.length, count, 'ordinary rerenders do not fetch')
    await probe.update({ ...options, mediaSrc: 'b.mp4' })
    const nextRender = probe.observations.length
    await probe.update(options)
    assert.equal(probe.observations[nextRender].status, 'loading')
    assert.deepEqual(probe.observations[nextRender].cues, [])
    assert.equal(probe.text, 'null')
    await act(async () => requests[1].reject(new Error('Retired B failure')))
    assert.equal(probe.last.status, 'loading')
    await act(async () => probe.last.reload())
    assert.equal(requests[2].signal.aborted, true)
    await act(async () => requests[2].resolve(vtt('Retired A result')))
    assert.equal(probe.text, 'null')
    assert.equal(probe.last.status, 'loading')
    await act(async () => requests[3].resolve(vtt('Explicit fresh result')))
    assert.match(probe.text, /Explicit fresh result/)
    await probe.update({ ...options, enabled: false })
    assert.equal(probe.last.status, 'idle')
    const enabledRender = probe.observations.length
    await probe.update(options)
    assert.equal(probe.observations[enabledRender].status, 'loading')
    assert.deepEqual(probe.observations[enabledRender].cues, [])
  })

  test(`${host} loading exposes acquisition and typed parse errors; retry invalidates successful cues too`, async (t) => {
    let attempt = 0
    const loadText = () => {
      attempt++
      if (attempt === 1) throw new Error('Network unavailable')
      if (attempt === 2) return Promise.resolve(vtt('Recovered captions'))
      if (attempt === 3) return Promise.resolve(vtt('<b>Unsupported markup</b>'))
      return Promise.resolve('not WEBVTT')
    }
    const probe = await harness(t, native, { mediaSrc: 'a.mp4', trackSrc: 'a.vtt', loadText })
    assert.deepEqual(probe.last.error, {
      mediaSrc: 'a.mp4',
      trackSrc: 'a.vtt',
      operation: 'load',
      message: 'Network unavailable',
      code: null,
      line: null,
    })
    assert.equal(probe.last.status, 'error')
    assert.deepEqual(probe.last.cues, [])
    assert.equal(attempt, 1, 'errors do not automatically retry')
    const reload = probe.last.reload
    await act(async () => reload())
    assert.equal(probe.last.status, 'ready')
    assert.match(probe.text, /Recovered captions/)
    const nextRender = probe.observations.length
    await act(async () => reload())
    assert.equal(probe.observations[nextRender].status, 'loading')
    assert.deepEqual(probe.observations[nextRender].cues, [])
    assert.equal(probe.last.status, 'error')
    assert.equal(probe.last.error.operation, 'parse')
    assert.equal(probe.last.error.code, 'unsupported-webvtt')
    assert.equal(probe.last.error.line, 4)
    assert.equal(probe.text, 'null')
    await act(async () => reload())
    assert.equal(probe.last.error.code, 'invalid-webvtt')
    assert.equal(probe.last.error.line, 1)
    assert.equal(probe.last.reload, reload)
  })

  test(`${host} StrictMode replay cancels the old acquisition without hiding the current result`, async (t) => {
    const requests = []
    const loadText = (_src, signal) => {
      const request = { signal, ...deferred() }
      requests.push(request)
      return request.promise
    }
    const probe = await harness(t, native, { mediaSrc: 'a.mp4', trackSrc: 'a.vtt', loadText }, true)
    assert.equal(requests.length, 2)
    assert.equal(requests[0].signal.aborted, true)
    assert.equal(requests[1].signal.aborted, false)
    await act(async () => requests[1].resolve(vtt('Current effect')))
    await act(async () => requests[0].resolve(vtt('Retired effect')))
    assert.match(probe.text, /Current effect/)
    assert.doesNotMatch(probe.text, /Retired effect/)
    await probe.unmount()
    assert.equal(requests[1].signal.aborted, true)
  })

  test(`${host} server rendering starts no requests and validates source names`, async () => {
    const { useWebVTTCaptions } = await entry(native)
    let calls = 0
    function Probe(props) {
      return React.createElement(
        'p',
        null,
        useWebVTTCaptions({
          ...props,
          loadText: async () => {
            calls++
            return vtt('Never fetched in render')
          },
        }).status,
      )
    }
    const props = { mediaSrc: 'a.mp4', trackSrc: 'a.vtt' }
    assert.equal(renderToStaticMarkup(React.createElement(Probe, props)), '<p>loading</p>')
    assert.equal(
      renderToStaticMarkup(React.createElement(Probe, { ...props, trackSrc: null })),
      '<p>idle</p>',
    )
    assert.equal(calls, 0)
    for (const patch of [{ mediaSrc: ' ' }, { trackSrc: ' ' }])
      assert.throws(() => renderToStaticMarkup(React.createElement(Probe, { ...props, ...patch })))
  })

  test(`${host} default loader checks HTTP status and handles body decoding rejection`, async (t) => {
    const requests = []
    t.mock.method(globalThis, 'fetch', async (src, options) => {
      requests.push({ src, options })
      return {
        ok: src === 'body.vtt',
        status: 404,
        text: async () => {
          assert.equal(src, 'body.vtt', 'HTTP error bodies must not be parsed')
          throw new Error('Cannot read body')
        },
      }
    })
    const probe = await harness(t, native, { mediaSrc: 'a.mp4', trackSrc: 'missing.vtt' })
    assert.match(probe.last.error.message, /HTTP 404/)
    assert.equal(probe.last.error.operation, 'load')
    assert.ok(requests[0].options.signal instanceof AbortSignal)
    await probe.update({ mediaSrc: 'a.mp4', trackSrc: 'body.vtt' })
    assert.equal(probe.last.error.message, 'Cannot read body')
    assert.equal(probe.last.error.operation, 'load')
  })
}
