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
    info: { render: { calls: 0, triangles: 0 } },
    getRenderTarget: () => null,
    render() {
      this.info.render.calls = 7
      this.info.render.triangles = 42
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
})
