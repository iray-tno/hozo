import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { exerciseVideoPoster, posterFrame, videoFrame } from './video-evidence.mjs'

function image(cover, scale = 1) {
  const width = 320 * scale
  const height = 180 * scale
  const step = Math.max(1, Math.floor(height / 200))
  const pixels = []
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const coloured = cover
        ? Math.abs(x / scale - 160) + Math.abs(y / scale - 90) <= 55
        : x / scale >= 20 && x / scale < 60 && y / scale >= 65 && y / scale < 105
      pixels.push(coloured ? (cover ? [20, 184, 166] : [129, 140, 248]) : [15, 23, 42])
    }
  }
  return { width, height, pixels }
}

function harness(overrides = {}) {
  const evidence = {}
  const taps = []
  const routes = []
  const checks = []
  let mounted = true
  return {
    evidence,
    taps,
    routes,
    checks,
    driver: {
      story: async (id) => routes.push(id),
      waitFor: async () => ({ rect: [0, 0, 320, 180] }),
      waitStatus: async (accept) => {
        const status = { status: 'ready', playing: false, time: 0, duration: 4.01 }
        assert.ok(accept(status))
        return status
      },
      tap: async (text) => {
        taps.push(text)
        if (text === 'Remove probe') mounted = false
        if (text === 'Mount probe') mounted = true
      },
      hasVideo: () => mounted,
      capture: (name) => image(!name.startsWith('poster-viewing')),
      waitForImage: async (read, accept) => {
        const pixels = read()
        assert.ok(accept(pixels), 'pixel gate failed')
        return pixels
      },
      record: (name) => checks.push(name),
      ...overrides,
    },
  }
}

test('cover and video pixel gates are mutually distinct at Native densities, and reject blanks, solid colours and bad grids', () => {
  for (const scale of [1, 2, 3]) {
    assert.ok(posterFrame(image(true, scale)).tealFraction > 0.1)
    assert.throws(() => videoFrame(image(true, scale)), /square missing/)
    assert.throws(() => posterFrame(image(false, scale)), /diamond missing/)
  }
  for (const colour of [
    [0, 0, 0],
    [255, 255, 255],
    [20, 184, 166],
  ]) {
    const blank = image(true)
    blank.pixels = blank.pixels.map(() => colour)
    assert.throws(() => posterFrame(blank), /diamond missing/)
  }
  assert.throws(() => posterFrame({ ...image(true), pixels: [] }), /sampling grid/)
  assert.throws(() => posterFrame({ ...image(true), width: 20 }), /clipped/)
})

test('cover round preserves source/cover hashes, paused observations, one seek, actual reveal and remount cover', async () => {
  const h = harness()
  await exerciseVideoPoster(h.driver, h.evidence)
  assert.equal(h.evidence.videoPoster.passed, true)
  assert.deepEqual(h.taps, ['Seek probe start', 'Remove probe', 'Mount probe', 'Add one'])
  assert.deepEqual(h.routes, [
    'media-video--poster-evidence',
    'primitives-shared-showcase--buttons',
  ])
  assert.equal(h.checks.length, 1)
  assert.equal(h.evidence.videoPoster.captures.length, 3)
  assert.equal(
    h.evidence.videoPoster.posterFixtureSha256,
    createHash('sha256')
      .update(readFileSync(new URL('../../showcase/assets/hozo-video-poster.png', import.meta.url)))
      .digest('hex'),
  )
  assert.ok(h.evidence.videoPoster.initial.tealFraction > 0.1)
  assert.ok(h.evidence.videoPoster.viewing.squareFraction > 0.02)
  assert.ok(h.evidence.videoPoster.remounted.tealFraction > 0.1)
})

test('a missing cover or retained static poster aborts, retains failed captures and never retries the input', async () => {
  for (const cover of [false, true]) {
    const h = harness({ capture: () => image(cover) })
    await assert.rejects(exerciseVideoPoster(h.driver, h.evidence), /pixel gate failed/)
    assert.equal(h.evidence.videoPoster.passed, false)
    assert.ok(h.evidence.videoPoster.observations.some((sample) => sample.error))
    assert.deepEqual(h.taps, cover ? ['Seek probe start'] : [])
    assert.equal(h.checks.length, 0)
    assert.ok(h.evidence.videoPoster.error)
  }
})

test('ambiguous poster input failure stops at seek and cannot progress or become a successful repeat', async () => {
  let taps = 0
  const h = harness({
    tap: async () => {
      taps++
      throw new Error('HID failed')
    },
  })
  await assert.rejects(exerciseVideoPoster(h.driver, h.evidence), /HID failed/)
  assert.equal(taps, 1)
  assert.equal(h.evidence.videoPoster.phase, 'seek')
  assert.equal(h.evidence.videoPoster.passed, false)
  assert.equal(h.checks.length, 0)
})

test('both smoke drivers run the additive poster probe without replacing the original Video gates', () => {
  for (const platform of ['android', 'ios']) {
    const source = readFileSync(new URL(`./${platform}-smoke.mjs`, import.meta.url), 'utf8')
    assert.match(source, /await exerciseVideo\(videoDriver, evidence\)/)
    assert.match(source, /await exerciseVideoPoster\(videoDriver, evidence\)/)
    assert.ok(source.indexOf('await exerciseVideoPoster') > source.indexOf('await exerciseVideo('))
  }
})
