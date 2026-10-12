import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { setTimeout as pause } from 'node:timers/promises'
import { outputPCM, wavSnapshot } from './audio-output.mjs'
import {
  AUDIO_SETTINGS_LIMITS,
  audioSettingsMetrics,
  verifyAudioSettings,
  verifyRelativeGain,
} from './audio-settings-metrics.mjs'

export const AUDIO_SETTINGS_PROFILES = Object.freeze([
  { phase: 'baseline', volume: 1, playbackRate: 1, preservesPitch: true },
  {
    phase: 'quarter',
    volume: 0.25,
    playbackRate: 1,
    preservesPitch: true,
    action: 'Quarter probe volume',
  },
  {
    phase: 'restored-volume',
    volume: 1,
    playbackRate: 1,
    preservesPitch: true,
    action: 'Full probe volume',
  },
  { phase: 'slow', volume: 1, playbackRate: 0.5, preservesPitch: true, action: 'Half probe speed' },
  { phase: 'fast', volume: 1, playbackRate: 2, preservesPitch: true, action: 'Double probe speed' },
  {
    phase: 'fast-shifted',
    volume: 1,
    playbackRate: 2,
    preservesPitch: false,
    action: 'Disable probe pitch correction',
  },
  {
    phase: 'restored-settings',
    volume: 1,
    playbackRate: 1,
    preservesPitch: true,
    action: 'Reset probe settings',
  },
])

/** One input/capture per phase. All raw measurements survive a failed gate. */
export async function exerciseAudioSettingsOutput(
  driver,
  evidence,
  file,
  output,
  { sleep = pause } = {},
) {
  const result = {
    passed: false,
    phase: 'load',
    backend: 'QEMU WAV sound-card output',
    limits: AUDIO_SETTINGS_LIMITS,
    captures: [],
    actions: [],
    fixtureSha256: createHash('sha256')
      .update(readFileSync(new URL('../../showcase/assets/hozo-audio.wav', import.meta.url)))
      .digest('hex'),
  }
  evidence.audioSettingsOutput = result
  const act = async (name) => {
    result.actions.push(name)
    await driver.tap(name)
  }
  try {
    await driver.story('media-audio--settings-output-evidence', 'Native audio settings output')
    await driver.waitFor('Audio settings probe: ready; paused')
    await act('Play settings probe')
    await driver.waitFor('Audio settings probe: ready; playing')
    let baseline
    for (const profile of AUDIO_SETTINGS_PROFILES) {
      result.phase = profile.phase
      if (profile.action) await act(profile.action)
      await driver.waitFor(
        `Requested volume: ${profile.volume}; speed: ${profile.playbackRate}x; pitch=${profile.preservesPitch}`,
      )
      await driver.waitFor('Audio settings probe: ready; playing')
      // A fixed exclusion for queued settings is not an acknowledgment of them.
      // Only the subsequent recording decides whether the output changed.
      await sleep(1000)
      const cursor = outputPCM(readFileSync(file)).cursor
      const started = Date.now()
      await sleep(12000)
      const pcm = outputPCM(readFileSync(file), cursor)
      const name = `audio-settings-${profile.phase}.wav`
      const recording = wavSnapshot(pcm)
      writeFileSync(resolve(output, name), recording)
      const capture = {
        phase: profile.phase,
        requested: profile,
        name,
        cursor,
        end: pcm.cursor,
        rate: pcm.rate,
        channels: pcm.channels,
        elapsedMs: Date.now() - started,
        sha256: createHash('sha256').update(recording).digest('hex'),
        metrics: audioSettingsMetrics(pcm),
      }
      result.captures.push(capture)
      capture.analysis = verifyAudioSettings(capture.metrics, profile)
      if (profile.phase === 'baseline') baseline = capture.analysis
      if (profile.phase === 'quarter') {
        capture.relativeGain = verifyRelativeGain(
          baseline,
          capture.analysis,
          AUDIO_SETTINGS_LIMITS.quarterGain,
        )
        driver.record(
          'Android player gain 25% attenuates each captured tone relative to this run baseline',
        )
      }
      if (profile.phase.startsWith('restored')) {
        capture.relativeGain = verifyRelativeGain(
          baseline,
          capture.analysis,
          AUDIO_SETTINGS_LIMITS.restoredGain,
        )
      }
      if (profile.phase === 'restored-volume')
        driver.record('Android output gain restores without replacing or restarting playback')
      if (profile.phase === 'slow')
        driver.record(
          'Android half-speed output stretches pulse intervals while retaining tone frequencies',
        )
      if (profile.phase === 'fast')
        driver.record(
          'Android double-speed output shortens pulse intervals while retaining tone frequencies',
        )
      if (profile.phase === 'fast-shifted')
        driver.record(
          'Android disabling pitch correction doubles the actual output frequencies at double speed',
        )
      if (profile.phase === 'restored-settings')
        driver.record(
          'Android resetting rate/pitch/gain restores the original output pattern and amplitude',
        )
    }
    await driver.story('primitives-shared-showcase--buttons', 'Add one')
    await act('Add one')
    await driver.waitFor('Pressed 1 times')
    driver.record('Android remains interactive after settings-output player unmount')
    result.passed = true
  } catch (error) {
    result.error = error.stack
    throw error
  }
}
