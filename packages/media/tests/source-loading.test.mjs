import assert from 'node:assert/strict'
import test from 'node:test'
import React, { act } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { create } from 'react-test-renderer'
import { sourceEntry as entry } from './helpers/source-entry.mjs'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

async function harness(t, native, initial, strict = false) {
  const { useMediaSource } = await entry(native)
  const observations = []
  function Probe(props) {
    const result = useMediaSource(props)
    observations.push(result)
    return result.uri ? React.createElement('p', null, result.uri) : null
  }
  const render = (props) =>
    strict
      ? React.createElement(React.StrictMode, null, React.createElement(Probe, props))
      : React.createElement(Probe, props)
  let renderer
  await act(async () => {
    renderer = create(render(initial))
  })
  t.after(async () => {
    await act(async () => renderer.unmount())
  })
  return {
    observations,
    get last() {
      return observations.at(-1)
    },
    update: async (props) => act(async () => renderer.update(render(props))),
    unmount: async () => act(async () => renderer.unmount()),
  }
}

function requests() {
  const pending = []
  const resolveSource = (source, signal) => {
    const request = { source, signal, ...deferred() }
    pending.push(request)
    return request.promise
  }
  return { pending, resolveSource }
}

for (const native of [false, true]) {
  const host = native ? 'Native' : 'Web'
  test(`${host} source resolution runs after commit, returns URI only, and does not repeat on unrelated renders`, async (t) => {
    const { useMediaSource, resolveMediaURI } = await entry(native)
    let calls = 0
    function SSR() {
      useMediaSource({
        source: 'clip',
        resolveSource: () => {
          calls++
          return 'file:///clip.mp4'
        },
      })
      return null
    }
    assert.equal(renderToStaticMarkup(React.createElement(SSR)), '')
    assert.equal(calls, 0, 'rendering alone never downloads or allocates a player')
    assert.equal(resolveMediaURI('/assets/clip.mp4'), '/assets/clip.mp4')
    for (const invalid of ['', ' ', null, 12])
      assert.throws(() => resolveMediaURI(invalid), TypeError)
    const resolver = () => {
      calls++
      return 'file:///clip.mp4'
    }
    const props = { source: 'clip', resolveSource: resolver }
    const p = await harness(t, native, props)
    assert.equal(p.last.status, 'ready')
    assert.equal(p.last.uri, 'file:///clip.mp4')
    const reload = p.last.reload
    await p.update({ ...props, clock: 3 })
    assert.equal(calls, 1)
    assert.equal(p.last.reload, reload)
  })

  test(`${host} source change and A-B-A hide old data before effects and ignore reverse completion`, async (t) => {
    const r = requests()
    const a = { source: 'a', resolveSource: r.resolveSource }
    const p = await harness(t, native, a)
    await act(async () => r.pending[0].resolve('file:///a'))
    const at = p.observations.length
    await p.update({ ...a, source: 'b' })
    assert.equal(p.observations[at].uri, null)
    assert.equal(p.observations[at].status, 'loading')
    assert.equal(r.pending[0].signal.aborted, true, 'settled request lifetime is retired too')
    await p.update(a)
    assert.equal(r.pending[1].signal.aborted, true)
    await act(async () => r.pending[2].resolve('file:///fresh-a'))
    await act(async () => r.pending[1].reject(new Error('late B failure')))
    assert.equal(p.last.uri, 'file:///fresh-a')
    assert.equal(p.last.error, null)
    const before = p.observations.length
    await act(async () => p.last.reload())
    assert.equal(p.observations[before].uri, null)
    assert.equal(p.last.status, 'loading')
    await act(async () => r.pending[3].resolve('file:///refreshed-a'))
    assert.equal(p.last.uri, 'file:///refreshed-a')
  })

  test(`${host} deselection, disable, resolver replacement and unmount retire success/failure`, async (t) => {
    const r = requests()
    const base = { source: 42, resolveSource: r.resolveSource }
    const p = await harness(t, native, base)
    await p.update({ ...base, enabled: false })
    assert.equal(p.last.status, 'idle')
    assert.equal(p.last.uri, null)
    await act(async () => r.pending[0].resolve('old'))
    assert.equal(p.last.uri, null)
    await act(async () => p.last.reload())
    assert.equal(r.pending.length, 1, 'reload while disabled does not resolve')
    await p.update(base)
    await p.update({ ...base, source: null })
    assert.equal(p.last.status, 'idle')
    await act(async () => r.pending[1].reject(new Error('deselected')))
    assert.equal(p.last.error, null)
    const next = requests()
    await p.update(base)
    await p.update({ ...base, resolveSource: next.resolveSource })
    assert.equal(r.pending[2].signal.aborted, true)
    await act(async () => next.pending[0].resolve('new-resolver'))
    assert.equal(p.last.uri, 'new-resolver')
    await p.update({ ...base, source: 43 })
    const count = p.observations.length
    await p.unmount()
    assert.equal(r.pending[3].signal.aborted, true)
    await act(async () => r.pending[3].reject(new Error('unmounted')))
    assert.equal(p.observations.length, count)
  })

  test(`${host} resolver failure and invalid output are visible, retry is explicit and snapshots detached`, async (t) => {
    let calls = 0
    const resolveSource = () => {
      calls++
      throw new Error('asset missing')
    }
    const props = { source: 'missing', resolveSource }
    const p = await harness(t, native, props)
    assert.deepEqual(p.last.error, {
      source: 'missing',
      operation: 'resolve',
      message: 'asset missing',
    })
    p.last.error.message = 'authored mutation'
    await p.update({ ...props, unrelated: true })
    assert.equal(p.last.error.message, 'asset missing')
    assert.equal(calls, 1)
    await act(async () => p.last.reload())
    assert.equal(calls, 2)
    for (const value of ['', ' ', null, 42, { uri: 'not a string' }]) {
      await p.update({ ...props, resolveSource: () => value })
      assert.equal(p.last.status, 'error')
      assert.equal(p.last.uri, null)
      assert.match(p.last.error.message, /nonempty URI/)
    }
    await p.update({ ...props, resolveSource: () => '/accepted' })
    assert.equal(p.last.uri, '/accepted')
    assert.equal(p.last.error, null)
  })

  test(`${host} StrictMode replay retires the first request rather than treating it as recovery`, async (t) => {
    const r = requests()
    const p = await harness(t, native, { source: 'clip', resolveSource: r.resolveSource }, true)
    assert.equal(r.pending.length, 2)
    assert.equal(r.pending[0].signal.aborted, true)
    await act(async () => r.pending[0].resolve('retired'))
    assert.equal(p.last.status, 'loading')
    await act(async () => r.pending[1].resolve('current'))
    assert.equal(p.last.uri, 'current')
  })

  test(`${host} objects are opaque resolver inputs, not silently converted to URLs`, async (t) => {
    const r = requests()
    const source = { identity: 'asset-a', token: 123 }
    const p = await harness(t, native, { source, resolveSource: r.resolveSource })
    assert.equal(r.pending[0].source, source)
    await act(async () => r.pending[0].resolve('/same-uri'))
    await p.update({ source: { ...source }, resolveSource: r.resolveSource })
    assert.equal(p.last.uri, null)
    assert.equal(
      r.pending.length,
      2,
      'a new input identity is a fresh resolution even for the same URI',
    )
    await act(async () => r.pending[1].resolve('/same-uri'))
    assert.equal(p.last.uri, '/same-uri')
  })
}

test('source loading requires an explicit resolver before any side effect', async () => {
  const { useMediaSource } = await entry()
  function Probe() {
    useMediaSource({ source: 42 })
    return null
  }
  assert.throws(() => renderToStaticMarkup(React.createElement(Probe)), /requires a resolver/)
})
