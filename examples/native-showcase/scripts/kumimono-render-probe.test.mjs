import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { transformSync } = require('esbuild')
const source = readFileSync(new URL('../src/kumimono-render-probe.ts', import.meta.url), 'utf8')
const { code } = transformSync(source, { loader: 'ts', format: 'cjs' })
const module = { exports: {} }
new Function('module', code)(module)
const { observeKumimonoRender } = module.exports

const study = () => ({
  scene: {},
  camera: { position: { toArray: () => [8, 5, 13] } },
  animationObject: {
    position: { toArray: () => [0, 4, 0] },
    matrixWorld: { toArray: () => [1, 0, 0, 1] },
  },
})

test('render observation preserves every render, receiver and return without extra frames', () => {
  const model = study()
  const events = []
  let calls = 0
  let progress = 1
  const renderer = {
    render(scene, camera) {
      assert.equal(this, renderer)
      assert.equal(scene, model.scene)
      assert.equal(camera, model.camera)
      calls++
      return 'original result'
    },
  }
  observeKumimonoRender(
    renderer,
    model,
    () => progress,
    (event) => events.push(event),
  )
  for (progress of [1, 1, 0.5, 0, 0, 1])
    assert.equal(renderer.render(model.scene, model.camera), 'original result')
  assert.equal(calls, 6)
  assert.deepEqual(
    events.map(({ phase, progress }) => [phase, progress]),
    [
      ['render-start', 1],
      ['render-return', 1],
      ['render-start', 0],
      ['render-return', 0],
      ['render-start', 1],
      ['render-return', 1],
    ],
  )
  assert.equal(events[0].sameScene, true)
  assert.equal(events[0].sameCamera, true)
})

test('a different rendered scene/camera is reported, not silently corrected', () => {
  const model = study()
  const events = []
  const renderer = { render() {} }
  observeKumimonoRender(
    renderer,
    model,
    () => 0,
    (event) => events.push(event),
  )
  renderer.render({}, { position: { toArray: () => [1, 2, 3] } })
  assert.equal(events[0].sameScene, false)
  assert.equal(events[0].sameCamera, false)
  assert.deepEqual(events[0].cameraPosition, [1, 2, 3])
})

test('a renderer error propagates and cannot produce a render-return observation', () => {
  const model = study()
  const events = []
  const failure = new Error('render failed')
  const renderer = {
    render() {
      throw failure
    },
  }
  observeKumimonoRender(
    renderer,
    model,
    () => 0,
    (event) => events.push(event),
  )
  assert.throws(
    () => renderer.render(model.scene, model.camera),
    (error) => error === failure,
  )
  assert.deepEqual(
    events.map(({ phase }) => phase),
    ['render-start'],
  )
})

test('draw counters and output target are observed after rendering without GL queries', () => {
  const model = study()
  const events = []
  const renderer = {
    info: { render: { calls: 0, triangles: 0, frame: 0 } },
    getRenderTarget: () => null,
    render() {
      this.info.render.calls = 7
      this.info.render.triangles = 42
      this.info.render.frame++
    },
  }
  observeKumimonoRender(
    renderer,
    model,
    () => 0,
    (event) => events.push(event),
  )
  renderer.render(model.scene, model.camera)
  assert.equal(events[1].drawCalls, 7)
  assert.equal(events[1].triangles, 42)
  assert.equal(events[1].defaultFramebuffer, true)
  assert.equal(events[1].frame, 1)
  assert.equal(events[1].commandFlushMs, undefined)
})

test('an explicit command-flush diagnostic runs after each render, including intermediate frames', () => {
  const model = study()
  const order = []
  const events = []
  let progress = 1
  const renderer = {
    render() {
      order.push('render')
      return 'render result'
    },
  }
  observeKumimonoRender(
    renderer,
    model,
    () => progress,
    (event) => events.push(event),
    () => {
      order.push('flush')
    },
  )
  for (progress of [1, 0.5, 0]) {
    assert.equal(renderer.render(model.scene, model.camera), 'render result')
  }
  assert.deepEqual(order, ['render', 'flush', 'render', 'flush', 'render', 'flush'])
  assert.equal(events.length, 4)
  assert.ok(events[1].commandFlushMs >= 0)
})

test('a failed command-flush diagnostic propagates without claiming completion', () => {
  const model = study()
  const events = []
  const renderer = { render() {} }
  const failure = new Error('flush failed')
  observeKumimonoRender(
    renderer,
    model,
    () => 0,
    (event) => events.push(event),
    () => {
      throw failure
    },
  )
  assert.throws(
    () => renderer.render(model.scene, model.camera),
    (error) => error === failure,
  )
  assert.deepEqual(
    events.map(({ phase }) => phase),
    ['render-start'],
  )
})

test('endpoint workload separates JS submission time from elapsed time without GL queries', () => {
  const model = study()
  let time = 0
  let progress = 1
  const events = []
  const renderer = {
    info: { render: { calls: 0 } },
    render() {
      time += progress === 1 ? 10 : 4
      this.info.render.calls = progress === 1 ? 230 : 184
    },
  }
  observeKumimonoRender(
    renderer,
    model,
    () => progress,
    (event) => events.push(event),
    undefined,
    () => time,
  )
  renderer.render(model.scene, model.camera)
  time += 100
  progress = 0.5
  renderer.render(model.scene, model.camera)
  time += 100
  progress = 0
  renderer.render(model.scene, model.camera)
  const endpoints = events.filter(({ phase }) => phase === 'render-return')
  assert.equal(endpoints[0].intervalSubmittedFrames, 1)
  assert.equal(endpoints[0].intervalJsSubmitMs, 10)
  assert.equal(endpoints[0].sincePreviousEndpointMs, undefined)
  assert.equal(endpoints[1].jsSubmitMs, 4)
  assert.equal(endpoints[1].intervalSubmittedFrames, 2)
  assert.equal(endpoints[1].intervalJsSubmitMs, 8)
  assert.equal(endpoints[1].intervalMaxJsSubmitMs, 4)
  assert.equal(endpoints[1].intervalMainPassDrawCalls, 368)
  assert.equal(endpoints[1].sincePreviousEndpointMs, 208)
})
