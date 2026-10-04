import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { transformSync } = require('esbuild')
const source = readFileSync(new URL('../src/kumimono-submission-probe.ts', import.meta.url), 'utf8')
const { code } = transformSync(source, { loader: 'ts', format: 'cjs' })
const module = { exports: {} }
new Function('module', code)(module)
const { paceKumimonoRender } = module.exports

function fixture() {
  const study = { scene: {}, camera: {} }
  let time = 0
  let progress = 1
  const submitted = []
  const events = []
  const renderer = {
    render(scene, camera) {
      assert.equal(this, renderer)
      submitted.push({ progress, time, scene, camera })
      return 'original result'
    },
  }
  paceKumimonoRender(
    renderer,
    study,
    () => progress,
    (event) => events.push(event),
    () => time,
  )
  return {
    study,
    renderer,
    submitted,
    events,
    frame(value, at) {
      progress = value
      time = at
      return renderer.render(study.scene, study.camera)
    },
  }
}

test('the 5Hz diagnostic submits the latest simulation state rather than replaying skipped frames', () => {
  const run = fixture()
  assert.equal(run.frame(1, 0), 'original result')
  assert.equal(run.frame(0.9, 16), undefined)
  run.frame(0.8, 32)
  run.frame(0.7, 100)
  assert.equal(run.frame(0.6, 200), 'original result')
  assert.deepEqual(
    run.submitted.map(({ progress }) => progress),
    [1, 0.6],
  )
})

test('both final endpoints bypass the interval and are never replaced by a stale intermediate state', () => {
  const run = fixture()
  run.frame(1, 0)
  run.frame(0.5, 200)
  run.frame(0, 210)
  run.frame(0.7, 220)
  run.frame(1, 230)
  assert.deepEqual(
    run.submitted.map(({ progress }) => progress),
    [1, 0.5, 0, 1],
  )
  assert.deepEqual(
    run.events.map(({ progress }) => progress),
    [1, 0, 1],
  )
  assert.equal(run.events.at(-1).submitted, 4)
  assert.equal(run.events.at(-1).coalesced, 1)
})

test('repeated demand frames at an unchanged endpoint do not bypass rate limiting', () => {
  const run = fixture()
  for (let i = 0; i < 10; i++) run.frame(1, i * 16)
  assert.equal(run.submitted.length, 1)
  assert.equal(run.events.length, 1)
})

test('another scene or camera is not suppressed by the sample-specific diagnostic', () => {
  const run = fixture()
  run.frame(1, 0)
  const otherScene = {}
  const otherCamera = {}
  assert.equal(run.renderer.render(otherScene, run.study.camera), 'original result')
  assert.equal(run.renderer.render(run.study.scene, otherCamera), 'original result')
  assert.equal(run.submitted[1].scene, otherScene)
  assert.equal(run.submitted[2].camera, otherCamera)
})

test('a failed render propagates with no extra render, retry or success observation', () => {
  const failure = new Error('native render failed')
  let attempts = 0
  const study = { scene: {}, camera: {} }
  const events = []
  const renderer = {
    render() {
      attempts++
      throw failure
    },
  }
  paceKumimonoRender(
    renderer,
    study,
    () => 0,
    (event) => events.push(event),
    () => 0,
  )
  assert.throws(
    () => renderer.render(study.scene, study.camera),
    (error) => error === failure,
  )
  assert.equal(attempts, 1)
  assert.equal(events.length, 0)
})

test('a normal 1.5s transition coalesces submission without changing its simulation ticks or duration', () => {
  const run = fixture()
  const simulated = []
  for (let frame = 0; frame <= 90; frame++) {
    const progress = 1 - frame / 90
    simulated.push(progress)
    run.frame(progress, frame * (1_500 / 90))
  }
  assert.equal(simulated.length, 91)
  assert.equal(simulated.at(-1), 0)
  assert.ok(run.submitted.length >= 8 && run.submitted.length <= 9)
  assert.equal(run.submitted.at(-1).progress, 0)
  assert.equal(run.submitted.at(-1).time, 1_500)
  assert.equal(run.events.at(-1).coalesced, simulated.length - run.submitted.length)
})

test('driver and workflow expose paced only as an explicit comparison; canonical mode stays demand', () => {
  const driver = readFileSync(new URL('./ios-smoke.mjs', import.meta.url), 'utf8')
  const workflow = readFileSync(
    new URL('../../../.github/workflows/native-showcase.yml', import.meta.url),
    'utf8',
  )
  assert.match(driver, /canvasMode: process.env.HOZO_IOS_CANVAS_MODE \|\| 'demand'/)
  assert.match(driver, /'three-kumimono--assembly-paced'/)
  assert.match(workflow, /options: \[demand, continuous, instant, synchronized, paced\]/)
})
