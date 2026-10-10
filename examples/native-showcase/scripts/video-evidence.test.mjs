import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { exerciseVideo, VIDEO_PROBE_LABEL, videoFrame, videoStatus } from './video-evidence.mjs'

function image(time = 0, scale = 1) {
  const width = 320 * scale
  const height = 180 * scale
  const step = Math.max(1, Math.floor(height / 200))
  const pixels = []
  const start = 20 + time * 60
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      pixels.push(
        x / scale >= start && x / scale < start + 40 && y / scale >= 65 && y / scale < 105
          ? [129, 140, 248]
          : [15, 23, 43],
      )
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
  let status = { status: 'ready', playing: false, time: 0, duration: 4.01 }
  const driver = {
    story: async (id) => routes.push(id),
    waitFor: async () => ({ rect: [0, 0, 320, 180] }),
    waitStatus: async (accept) => {
      assert.ok(accept(status), 'status gate failed')
      return { ...status }
    },
    tap: async (text) => {
      taps.push(text)
      if (text === 'Seek probe middle') status.time = 2
      if (text === 'Seek probe start') status.time = 0
      if (text === 'Play probe') {
        status.playing = true
        status.time = 0.5
      }
      if (text === 'Pause probe') status.playing = false
      if (text === 'Remove probe') mounted = false
      if (text === 'Mount probe') {
        mounted = true
        status = { status: 'ready', playing: false, time: 0, duration: 4.01 }
      }
    },
    hasVideo: () => mounted,
    capture: () => image(status.time),
    waitForImage: async (read, accept) => {
      const frame = read()
      assert.ok(accept(frame), 'pixel gate failed')
      return frame
    },
    record: (name) => checks.push(name),
    ...overrides,
  }
  return { driver, evidence, taps, routes, checks }
}

test('status parsing rejects prose and unknown fields rather than inferring playback from a button', () => {
  assert.deepEqual(videoStatus('Video probe: ready; paused; time=2.00; duration=4.01'), {
    status: 'ready',
    playing: false,
    time: 2,
    duration: 4.01,
  })
  assert.equal(
    videoStatus('Video probe: loading; paused; time=0.00; duration=unknown').duration,
    null,
  )
  for (const text of [
    'Play probe',
    'Video: ready; playing',
    'Video probe: ready; paused; time=NaN; duration=4.00',
    'Prefix Video probe: ready; paused; time=2.00; duration=4.00',
  ])
    assert.equal(videoStatus(text), undefined)
})

test('the owned frame is recognizable at device densities and its paused seek moves the actual square', () => {
  for (const scale of [1, 2, 2.625, 3]) {
    const first = videoFrame(image(0, scale))
    const middle = videoFrame(image(2, scale))
    assert.ok(first.centreX < 0.25)
    assert.ok(middle.centreX - first.centreX > 0.25)
    assert.ok(middle.centreX > 0.4 && middle.centreX < 0.7)
  }
  for (const colour of [
    [0, 0, 0],
    [255, 255, 255],
    [129, 140, 248],
  ]) {
    const blank = image()
    blank.pixels = blank.pixels.map(() => colour)
    assert.throws(() => videoFrame(blank), /square missing/)
  }
  const wrongBackground = image()
  wrongBackground.pixels = wrongBackground.pixels.map((rgb) =>
    rgb[0] === 15 ? [255, 255, 255] : rgb,
  )
  assert.throws(() => videoFrame(wrongBackground), /background missing/)
  assert.throws(() => videoFrame({ ...image(), width: 100 }), /clipped/)
  assert.throws(() => videoFrame({ ...image(), pixels: [] }), /sampling grid/)
})

test('both real smoke drivers include the same Video gates only within the full scenario', () => {
  for (const platform of ['android', 'ios']) {
    const source = readFileSync(new URL(`./${platform}-smoke.mjs`, import.meta.url), 'utf8')
    assert.match(source, /await exerciseVideo\(/)
    assert.match(source, /waitStatus:/)
    assert.match(source, /hasVideo: \(\) => nodes\(\)\.some\(label\(VIDEO_PROBE_LABEL\)\)/)
    assert.match(
      source,
      platform === 'ios'
        ? /capture: \(name, node\) => canvasImage\(name, node\)/
        : /capture: \(name, node\) => imageRegion\(screenshot\(name\), node.rect\)/,
    )
    assert.ok(
      source.indexOf('await exerciseVideo(') <
        source.indexOf('const canvas', source.indexOf('await exerciseVideo(')),
    )
  }
  assert.equal(VIDEO_PROBE_LABEL, 'Local video pixel probe')
})

test('one action per phase yields decoder, playback and lifetime checks, with original fixture provenance', async () => {
  const h = harness()
  await exerciseVideo(h.driver, h.evidence)
  assert.equal(h.evidence.video.passed, true)
  assert.equal(
    h.evidence.video.fixtureSha256,
    '42cc32226e5100184847e9e3394c6df889f2f944c921126b21fc3094aaa4458c',
  )
  assert.equal(h.checks.length, 3)
  assert.equal(h.routes[0], 'media-video--playback-evidence')
  assert.equal(h.routes.at(-1), 'primitives-shared-showcase--buttons')
  assert.deepEqual(h.taps, [
    'Seek probe middle',
    'Seek probe start',
    'Play probe',
    'Pause probe',
    'Remove probe',
    'Mount probe',
    'Add one',
  ])
  assert.equal(h.evidence.video.captures.length, 4)
  assert.ok(h.evidence.video.observations.some((s) => s.playing === true && s.time > 0))
})

test('a static poster cannot pass the seek gate even when status labels advance', async () => {
  const h = harness({ capture: () => image(0) })
  await assert.rejects(exerciseVideo(h.driver, h.evidence), /pixel gate failed/)
  assert.equal(h.evidence.video.passed, false)
  assert.equal(h.evidence.video.phase, 'middle')
  assert.equal(h.checks.length, 0)
  assert.deepEqual(h.taps, ['Seek probe middle'])
})

test('blank pixels retain failed measurements and never start or retry interactions', async () => {
  const blank = image()
  blank.pixels = blank.pixels.map(() => [0, 0, 0])
  const h = harness({ capture: () => blank })
  await assert.rejects(exerciseVideo(h.driver, h.evidence), /pixel gate failed/)
  assert.equal(h.evidence.video.passed, false)
  assert.ok(h.evidence.video.observations.some((s) => s.error?.includes('square missing')))
  assert.deepEqual(h.taps, [])
  assert.equal(h.checks.length, 0)
})

test('an ambiguous input failure aborts once, with the failed phase retained', async () => {
  let attempts = 0
  const h = harness({
    tap: async () => {
      attempts++
      throw new Error('HID timeout')
    },
  })
  await assert.rejects(exerciseVideo(h.driver, h.evidence), /HID timeout/)
  assert.equal(attempts, 1)
  assert.equal(h.evidence.video.phase, 'seek')
  assert.equal(h.evidence.video.passed, false)
  assert.equal(h.checks.length, 0)
})

test('removal must actually remove the viewport and cannot be rescued by a later remount', async () => {
  const h = harness({ hasVideo: () => true })
  await assert.rejects(exerciseVideo(h.driver, h.evidence), /viewport remains/)
  assert.equal(h.evidence.video.passed, false)
  assert.equal(h.evidence.video.phase, 'remove')
  assert.equal(h.checks.length, 2)
  assert.ok(!h.taps.includes('Mount probe'))
})

test('a playing flag without an advancing clock stops before pause or lifetime checks', async () => {
  const h = harness()
  const waitStatus = h.driver.waitStatus
  let reads = 0
  h.driver.waitStatus = async (accept, description) => {
    if (++reads === 4) {
      assert.ok(
        accept({ status: 'ready', playing: true, time: 0, duration: 4.01 }),
        'clock did not advance',
      )
    }
    return waitStatus(accept, description)
  }
  await assert.rejects(exerciseVideo(h.driver, h.evidence), /clock did not advance/)
  assert.equal(h.evidence.video.passed, false)
  assert.equal(h.evidence.video.phase, 'play')
  assert.equal(h.checks.length, 1)
  assert.ok(!h.taps.includes('Pause probe'))
})

test('a remount retaining the middle frame cannot pass as a fresh player', async () => {
  const h = harness()
  const capture = h.driver.capture
  h.driver.capture = (name) => (name.includes('remounted') ? image(2) : capture(name))
  await assert.rejects(exerciseVideo(h.driver, h.evidence), /pixel gate failed/)
  assert.equal(h.evidence.video.passed, false)
  assert.equal(h.evidence.video.phase, 'remounted')
  assert.equal(h.checks.length, 2)
  assert.equal(h.routes.length, 1)
})
