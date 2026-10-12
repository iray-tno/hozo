import assert from 'node:assert/strict'
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { outputPCM, wavSnapshot } from './audio-output.mjs'
import {
  AUDIO_SETTINGS_LIMITS,
  audioSettingsMetrics,
  verifyAudioSettings,
  verifyRelativeGain,
} from './audio-settings-metrics.mjs'
import { AUDIO_SETTINGS_PROFILES, exerciseAudioSettingsOutput } from './audio-settings-output.mjs'

// Independently synthesize the owned source's timing/frequencies after a
// hypothetical engine transform. This is analyzer evidence, never device output.
function signal({
  playbackRate = 1,
  preservesPitch = true,
  volume = 1,
  offset = 0,
  seconds = 12,
  channels = 1,
  noise = false,
  notes = [440, 660, 880],
} = {}) {
  const rate = 16000
  const count = Math.round(rate * seconds)
  const bytes = Buffer.alloc(count * 2 * channels)
  let random = 23456
  for (let index = 0; index < count; index++) {
    const time = index / rate
    const source = (time * playbackRate + offset) % 4
    const note = Math.floor(source)
    const phase = source - note - 0.25
    let value = 0
    if (note < 3 && phase >= 0 && phase < 0.4) {
      const ramp = Math.min(1, phase / 0.01, (0.4 - phase) / 0.01)
      const pitch = preservesPitch ? 1 : playbackRate
      value = 0.003 * volume * ramp * Math.sin(2 * Math.PI * notes[note] * pitch * time)
    }
    if (noise) {
      random = (Math.imul(random, 1664525) + 1013904223) >>> 0
      value = (random / 2 ** 32 - 0.5) * 0.04
    }
    const sample = Math.round(value * 32767)
    for (let channel = 0; channel < channels; channel++)
      bytes.writeInt16LE(channel === 1 ? -sample : sample, index * 2 * channels + channel * 2)
  }
  return wavSnapshot({ bytes, rate, channels })
}
const analyze = (options) => audioSettingsMetrics(outputPCM(signal(options)))

test('independent tone catalog measures .5x/2x pulse rates and preserved/shifted pitch at arbitrary phases', () => {
  for (const profile of AUDIO_SETTINGS_PROFILES)
    for (const offset of [0.01, 1.7, 3.99]) {
      const observation = verifyAudioSettings(analyze({ ...profile, offset }), profile)
      assert.ok(Math.abs(observation.medianRate - profile.playbackRate) < 0.06)
      assert.deepEqual(
        observation.frequencies,
        profile.preservesPitch ? [440, 660, 880] : [880, 1320, 1760],
      )
    }
  const lowShift = { playbackRate: 0.5, preservesPitch: false }
  assert.deepEqual(verifyAudioSettings(analyze(lowShift), lowShift).frequencies, [220, 330, 440])
  const opposite = verifyAudioSettings(analyze({ channels: 2 }), AUDIO_SETTINGS_PROFILES[0])
  assert.equal(opposite.medianRate, 1, 'opposite-polarity stereo must not be downmixed to silence')
})

test('relative gain uses per-note active RMS, survives arbitrary silence alignment, rejects ignored/reversed gain', () => {
  const base = verifyAudioSettings(analyze({ offset: 1.2 }), AUDIO_SETTINGS_PROFILES[0])
  const quarter = verifyAudioSettings(
    analyze({ volume: 0.25, offset: 3.8 }),
    AUDIO_SETTINGS_PROFILES[1],
  )
  const ratios = verifyRelativeGain(base, quarter, AUDIO_SETTINGS_LIMITS.quarterGain)
  for (const ratio of Object.values(ratios)) assert.ok(Math.abs(ratio - 0.25) < 0.015)
  for (const volume of [1, 0.5, 0.125]) {
    const wrong = verifyAudioSettings(analyze({ volume }), AUDIO_SETTINGS_PROFILES[1])
    assert.throws(() => verifyRelativeGain(base, wrong, AUDIO_SETTINGS_LIMITS.quarterGain), /gain/)
  }
  assert.throws(() => verifyRelativeGain(quarter, base, AUDIO_SETTINGS_LIMITS.quarterGain), /gain/)
  verifyRelativeGain(
    base,
    verifyAudioSettings(analyze({ offset: 2.9 }), AUDIO_SETTINGS_PROFILES[0]),
    AUDIO_SETTINGS_LIMITS.restoredGain,
  )
})

test('silence, short output, wrong speed, wrong pitch, wrong order and noise cannot pass a requested profile', () => {
  const fast = AUDIO_SETTINGS_PROFILES.find((p) => p.phase === 'fast')
  const shifted = AUDIO_SETTINGS_PROFILES.find((p) => p.phase === 'fast-shifted')
  for (const options of [{ volume: 0 }, { noise: true }, { notes: [440, 440, 440] }])
    assert.throws(() => verifyAudioSettings(analyze(options), AUDIO_SETTINGS_PROFILES[0]))
  assert.throws(
    () => verifyAudioSettings(analyze({ seconds: 5 }), AUDIO_SETTINGS_PROFILES[0]),
    /insufficient/,
  )
  assert.throws(() => verifyAudioSettings(analyze(), fast), /pulse rate/)
  assert.throws(
    () => verifyAudioSettings(analyze({ playbackRate: 2 }), shifted),
    /missing|frequency/,
  )
  assert.throws(
    () => verifyAudioSettings(analyze({ playbackRate: 2, preservesPitch: false }), fast),
    /missing|frequency/,
  )
  assert.throws(
    () => verifyAudioSettings(analyze({ notes: [660, 440, 880] }), AUDIO_SETTINGS_PROFILES[0]),
    /order/,
  )
})

function harness(t, ignored = null) {
  const output = mkdtempSync(join(tmpdir(), 'hozo-audio-settings-'))
  t.after(() => rmSync(output, { recursive: true, force: true }))
  const file = join(output, 'output.wav')
  writeFileSync(file, signal({ seconds: 0 }))
  const calls = []
  const checks = []
  const evidence = {}
  const driver = {
    story: async (id) => calls.push(id),
    waitFor: async () => {},
    tap: async (name) => calls.push(name),
    record: (name) => checks.push(name),
  }
  const sleep = async (ms) => {
    const profile = AUDIO_SETTINGS_PROFILES.find(
      (p) => p.phase === evidence.audioSettingsOutput.phase,
    )
    let measured = profile
    if (ignored === 'gain' && profile.phase === 'quarter') measured = { ...profile, volume: 1 }
    if (ignored === 'speed' && profile.phase === 'slow') measured = { ...profile, playbackRate: 1 }
    if (ignored === 'pitch' && profile.phase === 'fast-shifted')
      measured = { ...profile, preservesPitch: true }
    appendFileSync(file, signal({ ...measured, seconds: ms / 1000, offset: 0.42 }).subarray(44))
  }
  return { output, file, driver, calls, checks, evidence, sleep }
}

test('protocol retains seven output slices, gain/rate/pitch measurements and one play without a seek/restart', async (t) => {
  const h = harness(t)
  await exerciseAudioSettingsOutput(h.driver, h.evidence, h.file, h.output, { sleep: h.sleep })
  const result = h.evidence.audioSettingsOutput
  assert.equal(result.passed, true)
  assert.equal(h.checks.length, 7)
  assert.deepEqual(
    result.captures.map((c) => c.phase),
    AUDIO_SETTINGS_PROFILES.map((p) => p.phase),
  )
  assert.equal(h.calls.filter((name) => name === 'Play settings probe').length, 1)
  assert.equal(
    h.calls.some((name) => /seek|restart/i.test(name)),
    false,
  )
  for (const capture of result.captures) {
    const recording = readFileSync(join(h.output, capture.name))
    assert.deepEqual(audioSettingsMetrics(outputPCM(recording)), capture.metrics)
    assert.equal(capture.sha256.length, 64)
    assert.equal(capture.metrics.duration, 12)
  }
})

for (const [ignored, failedPhase] of [
  ['gain', 'quarter'],
  ['speed', 'slow'],
  ['pitch', 'fast-shifted'],
]) {
  test(`UI acknowledgments cannot hide an ignored ${ignored}: retain failed PCM and stop without retry`, async (t) => {
    const h = harness(t, ignored)
    await assert.rejects(
      exerciseAudioSettingsOutput(h.driver, h.evidence, h.file, h.output, { sleep: h.sleep }),
    )
    const result = h.evidence.audioSettingsOutput
    assert.equal(result.passed, false)
    assert.equal(result.phase, failedPhase)
    const last = result.captures.at(-1)
    assert.equal(last.phase, failedPhase)
    assert.ok(readFileSync(join(h.output, last.name)).length > 44)
    assert.ok(result.error)
    assert.equal(h.calls.filter((name) => name === 'Play settings probe').length, 1)
    const actions = AUDIO_SETTINGS_PROFILES.filter((p) => p.action).map((p) => p.action)
    const next = AUDIO_SETTINGS_PROFILES.findIndex((p) => p.phase === failedPhase) + 1
    if (AUDIO_SETTINGS_PROFILES[next]?.action)
      assert.ok(!h.calls.includes(AUDIO_SETTINGS_PROFILES[next].action))
    assert.equal(new Set(result.actions).size, result.actions.length)
    assert.ok(
      result.actions.every((name) => name === 'Play settings probe' || actions.includes(name)),
    )
  })
}

test('settings diagnosis has a separate capture/artifact and does not silently add release/full checks', () => {
  const workflow = readFileSync(
    new URL('../../../.github/workflows/native-showcase.yml', import.meta.url),
    'utf8',
  )
  assert.match(workflow, /options: \[full, svg-filters, audio-output, audio-settings\]/)
  assert.match(workflow, /inputs.android-scenario == 'audio-settings'/)
  assert.match(workflow, /name: hozo-native-showcase-android-audio-settings-evidence/)
  assert.match(workflow, /path: artifacts\/native-showcase-audio-settings/)
  const smoke = readFileSync(new URL('./android-smoke.mjs', import.meta.url), 'utf8')
  assert.match(
    smoke,
    /evidence.scenario === 'audio-settings' \? exerciseAudioSettingsOutput : exerciseAudioOutput/,
  )
})
