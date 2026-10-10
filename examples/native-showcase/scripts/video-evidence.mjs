import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

export const VIDEO_PROBE_LABEL = 'Local video pixel probe'

export function videoStatus(text = '') {
  const match =
    /^Video probe: (loading|ready|ended|error); (playing|paused); time=(\d+\.\d+); duration=(unknown|\d+\.\d+)$/.exec(
      text.replace(/\s+/g, ' ').trim(),
    )
  if (!match) return undefined
  return {
    status: match[1],
    playing: match[2] === 'playing',
    time: Number(match[3]),
    duration: match[4] === 'unknown' ? null : Number(match[4]),
  }
}

// Only the video viewport enters this measurement. Its owned fixture has one
// 40px periwinkle square on a dark 320x180 frame, moving left to right. Count
// colours with bounded codec tolerance and measure the square's centroid;
// changing a status label or presenting a blank surface cannot satisfy it.
export function videoFrame(image) {
  const { width, height, pixels } = image
  assert.ok(width >= 160 && height >= 90, 'video viewport is clipped or too small')
  const step = Math.max(1, Math.floor(Math.min(width, height) / 200))
  const columns = Math.ceil(width / step)
  assert.equal(pixels.length, columns * Math.ceil(height / step), 'invalid video sampling grid')
  let square = 0
  let dark = 0
  let x = 0
  let y = 0
  for (const [index, [r, g, b]] of pixels.entries()) {
    if (r < 50 && g < 65 && b < 90) dark++
    if (r >= 95 && r <= 165 && g >= 105 && g <= 175 && b >= 215 && b - r >= 70) {
      square++
      x += ((index % columns) * step + 0.5) / width
      y += (Math.floor(index / columns) * step + 0.5) / height
    }
  }
  const fraction = square / pixels.length
  assert.ok(fraction >= 0.01 && fraction <= 0.06, `local video square missing: ${fraction}`)
  assert.ok(dark / pixels.length >= 0.85, 'video background missing or controls obscure pixels')
  const centreX = x / square
  const centreY = y / square
  assert.ok(centreY >= 0.4 && centreY <= 0.55, 'video square has wrong vertical position')
  return { squareFraction: fraction, darkFraction: dark / pixels.length, centreX, centreY }
}

export async function exerciseVideo(driver, evidence) {
  const result = { passed: false, captures: [], observations: [] }
  evidence.video = result
  result.fixtureSha256 = createHash('sha256')
    .update(readFileSync(new URL('../../showcase/assets/hozo-video.mp4', import.meta.url)))
    .digest('hex')
  const observe = async (predicate, description) => {
    const status = await driver.waitStatus(predicate, description)
    result.observations.push({ phase: result.phase, observedAt: Date.now(), ...status })
    return status
  }
  const frame = async (phase, accept) => {
    result.phase = phase
    const started = Date.now()
    let metrics
    await driver.waitForImage(
      () => {
        const name = `video-${phase}-${result.captures.length + 1}`
        result.captures.push(name)
        return driver.capture(name, result.surface)
      },
      (image) => {
        try {
          metrics = videoFrame(image)
          result.observations.push({ phase, observedAt: Date.now(), ...metrics })
          return accept(metrics)
        } catch (error) {
          result.observations.push({ phase, observedAt: Date.now(), error: String(error) })
          return false
        }
      },
      `video ${phase}`,
    )
    return { ...metrics, waitMs: Date.now() - started }
  }
  try {
    result.phase = 'load'
    await driver.story('media-video--playback-evidence', 'Native video playback')
    const initialStatus = await observe(
      (s) => s.status === 'ready' && !s.playing && s.time < 0.2 && s.duration > 3 && s.duration < 5,
      'loaded paused local video',
    )
    result.duration = initialStatus.duration
    result.surface = await driver.waitFor(VIDEO_PROBE_LABEL)
    const initial = await frame('initial', (m) => m.centreX < 0.25)
    result.initial = initial
    result.phase = 'seek'
    await driver.tap('Seek probe middle')
    await observe(
      (s) => s.status === 'ready' && !s.playing && Math.abs(s.time - 2) < 0.2,
      'observed seek to 2s',
    )
    result.middle = await frame(
      'middle',
      (m) => m.centreX > 0.4 && m.centreX < 0.7 && m.centreX - initial.centreX > 0.25,
    )
    driver.record('local video decodes distinct paused seek frames', {
      initial: result.initial,
      middle: result.middle,
      fixtureSha256: result.fixtureSha256,
    })

    result.phase = 'play'
    await driver.tap('Seek probe start')
    await observe(
      (s) => s.status === 'ready' && !s.playing && s.time < 0.2,
      'seek reset before playback',
    )
    await driver.tap('Play probe')
    await observe(
      (s) => s.status === 'ready' && s.playing && s.time > 0.25,
      'decoder playback clock advances',
    )
    await driver.tap('Pause probe')
    result.paused = await observe(
      (s) => s.status === 'ready' && !s.playing,
      'player observes pause',
    )
    await frame('paused', () => true)
    const stillPaused = await observe(
      (s) => s.status === 'ready' && !s.playing,
      'player stays paused after capture',
    )
    assert.ok(
      Math.abs(stillPaused.time - result.paused.time) <= 0.35,
      'video clock kept advancing after pause',
    )
    driver.record('video playback advances and pauses with a decoded image', {
      pausedTime: stillPaused.time,
    })

    result.phase = 'remove'
    await driver.tap('Remove probe')
    await driver.waitFor('Video probe removed')
    assert.equal(driver.hasVideo(), false, 'video viewport remains after unmount')
    result.phase = 'remount'
    await driver.tap('Mount probe')
    await observe(
      (s) => s.status === 'ready' && !s.playing && s.time < 0.2,
      'new player starts paused at zero',
    )
    result.surface = await driver.waitFor(VIDEO_PROBE_LABEL)
    result.remounted = await frame('remounted', (m) => m.centreX < 0.25)
    await driver.story('primitives-shared-showcase--buttons', 'Add one')
    await driver.tap('Add one')
    await driver.waitFor('Pressed 1 times')
    result.passed = true
    driver.record('video unmount and fresh remount leave the app interactive', {
      remounted: result.remounted,
    })
  } catch (error) {
    result.error = error.stack
    throw error
  }
}
