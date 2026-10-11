import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { setTimeout as pause } from 'node:timers/promises'

const tones = [440, 660, 880]
// PCM output includes the OS/mixer gain, not just the fixture's amplitude.
// Require sixteen 16-bit quantization steps of RMS, then identify the tone
// by normalized spectral coherence. Quiet recognizable output is not silence.
const minimumToneRms = 16 / 32768
const minimumCoherence = 0.85

// QEMU's WAV sink writes a canonical 44-byte PCM header. While the emulator
// runs its RIFF/data lengths are still zero; the actual written frames, not
// those unfinished lengths, are the live capture boundary.
export function outputPCM(buffer, cursor = 44) {
  assert.ok(buffer.length >= 44, 'emulator output WAV is missing its header')
  assert.equal(buffer.subarray(0, 4).toString(), 'RIFF')
  assert.equal(buffer.subarray(8, 16).toString(), 'WAVEfmt ')
  assert.equal(buffer.readUInt32LE(16), 16)
  assert.equal(buffer.readUInt16LE(20), 1, 'output must be PCM')
  const channels = buffer.readUInt16LE(22)
  const rate = buffer.readUInt32LE(24)
  const align = buffer.readUInt16LE(32)
  assert.ok(channels === 1 || channels === 2)
  assert.ok(rate >= 16000 && rate <= 96000)
  assert.equal(buffer.readUInt16LE(34), 16)
  assert.equal(align, channels * 2)
  assert.equal(buffer.readUInt32LE(28), rate * align)
  assert.equal(buffer.subarray(36, 40).toString(), 'data')
  assert.ok(Number.isInteger(cursor) && cursor >= 44 && (cursor - 44) % align === 0)
  assert.ok(cursor <= buffer.length, 'emulator capture was truncated/replaced')
  const end = 44 + Math.floor((buffer.length - 44) / align) * align
  const count = (end - cursor) / align
  // Do not downmix: opposite-polarity channels must not appear silent.
  const samples = Array.from({ length: channels }, () => new Float64Array(count))
  for (let index = 0; index < count; index++)
    for (let channel = 0; channel < channels; channel++)
      samples[channel][index] = buffer.readInt16LE(cursor + index * align + channel * 2) / 32768
  return { rate, channels, samples, bytes: buffer.subarray(cursor, end), cursor: end }
}

export function audioMetrics({ rate, samples }) {
  let peak = 0
  let squared = 0
  const windows = Object.fromEntries(tones.map((tone) => [tone, 0]))
  const sequence = []
  const size = Math.round(rate / 10)
  for (const channel of samples)
    for (const sample of channel) {
      squared += sample * sample
      peak = Math.max(peak, Math.abs(sample))
    }
  for (let start = 0; start + size <= samples[0].length; start += size) {
    let winner = null
    let strength = 0
    for (const channel of samples) {
      let energy = 0
      for (let index = start; index < start + size; index++) {
        const sample = channel[index]
        energy += sample * sample
      }
      const rms = Math.sqrt(energy / size)
      if (rms < minimumToneRms) continue
      for (const frequency of tones) {
        const coefficient = 2 * Math.cos((2 * Math.PI * frequency) / rate)
        let previous = 0
        let before = 0
        for (let index = start; index < start + size; index++) {
          const next = channel[index] + coefficient * previous - before
          before = previous
          previous = next
        }
        const power = Math.max(0, previous ** 2 + before ** 2 - coefficient * previous * before)
        const amplitude = (2 * Math.sqrt(power)) / size
        const coherence = amplitude / (Math.SQRT2 * rms)
        if (coherence > minimumCoherence && coherence > strength) {
          strength = coherence
          winner = frequency
        }
      }
    }
    if (winner !== null) {
      windows[winner]++
      if (sequence.at(-1) !== winner) sequence.push(winner)
    }
  }
  const measured = samples[0].length
  return {
    duration: samples[0].length / rate,
    rms: measured ? Math.sqrt(squared / measured / samples.length) : 0,
    peak,
    toneWindows: windows,
    toneSequence: sequence,
  }
}

export function verifyAudio(metrics, audible) {
  assert.ok(metrics.duration >= 5, `insufficient output frames: ${metrics.duration}s`)
  if (!audible) {
    assert.ok(metrics.rms <= 0.0005 && metrics.peak <= 0.003, 'muted output is not silent')
    assert.ok(
      Object.values(metrics.toneWindows).every((count) => count === 0),
      'muted output contains recognizable fixture tones',
    )
    return
  }
  for (const tone of tones)
    assert.ok(metrics.toneWindows[tone] >= 2, `original ${tone}Hz tone missing from output`)
  for (let index = 1; index < metrics.toneSequence.length; index++)
    assert.equal(
      tones.indexOf(metrics.toneSequence[index]),
      (tones.indexOf(metrics.toneSequence[index - 1]) + 1) % tones.length,
      'captured notes do not rise in the owned fixture order',
    )
}

export function wavSnapshot(pcm) {
  const header = Buffer.alloc(44)
  header.write('RIFF')
  header.writeUInt32LE(pcm.bytes.length + 36, 4)
  header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(pcm.channels, 22)
  header.writeUInt32LE(pcm.rate, 24)
  header.writeUInt32LE(pcm.rate * pcm.channels * 2, 28)
  header.writeUInt16LE(pcm.channels * 2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.bytes.length, 40)
  return Buffer.concat([header, pcm.bytes])
}

export async function exerciseAudioOutput(driver, evidence, file, output, { sleep = pause } = {}) {
  const result = {
    passed: false,
    captures: [],
    phase: 'load',
    backend: 'QEMU WAV sound-card output',
    toneDetection: { minimumWindowRms: minimumToneRms, minimumCoherence },
  }
  evidence.audioOutput = result
  result.fixtureSha256 = createHash('sha256')
    .update(readFileSync(new URL('../../showcase/assets/hozo-audio.wav', import.meta.url)))
    .digest('hex')
  let cursor
  const capture = async (phase, audible) => {
    result.phase = phase
    // Exclude queued transition audio. This is a fixed observation window,
    // not repeated input or a retry until a favourable recording appears.
    await sleep(1_000)
    cursor = existsSync(file) ? outputPCM(readFileSync(file)).cursor : 44
    const started = Date.now()
    await sleep(6_000)
    const pcm = outputPCM(readFileSync(file), cursor)
    const name = `audio-${phase}.wav`
    writeFileSync(resolve(output, name), wavSnapshot(pcm))
    const metrics = audioMetrics(pcm)
    result.captures.push({
      phase,
      name,
      cursor,
      end: pcm.cursor,
      rate: pcm.rate,
      channels: pcm.channels,
      sha256: createHash('sha256').update(wavSnapshot(pcm)).digest('hex'),
      elapsedMs: Date.now() - started,
      ...metrics,
    })
    verifyAudio(metrics, audible)
    return metrics
  }
  try {
    await driver.story('media-audio--output-evidence', 'Native audio output')
    await driver.waitFor('Audio probe: ready; paused; muted=false')
    await driver.tap('Play audio probe')
    await driver.waitFor('Audio probe: ready; playing; muted=false')
    await capture('playing', true)
    driver.record('Android emits the owned three-tone audio through its virtual sound card')
    await driver.tap('Mute audio probe')
    await driver.waitFor('Audio probe: ready; playing; muted=true')
    await capture('muted', false)
    await driver.tap('Unmute audio probe')
    await driver.waitFor('Audio probe: ready; playing; muted=false')
    await capture('unmuted', true)
    driver.record('Android mute suppresses PCM while playback stays active; unmute restores tones')
    result.phase = 'remove'
    await driver.tap('Remove audio probe')
    await driver.waitFor('Audio probe removed')
    // A released sound card may stop producing frames altogether. Keep that
    // observation distinct from a successful nonempty muted-silence recording.
    await sleep(1_000)
    cursor = outputPCM(readFileSync(file)).cursor
    await sleep(3_000)
    const removed = outputPCM(readFileSync(file), cursor)
    writeFileSync(resolve(output, 'audio-removed.wav'), wavSnapshot(removed))
    result.removed = { frames: removed.samples[0].length, ...audioMetrics(removed) }
    assert.ok(
      result.removed.rms <= 0.0005 && result.removed.peak <= 0.003,
      'unmounted audio still sounds',
    )
    assert.ok(
      Object.values(result.removed.toneWindows).every((count) => count === 0),
      'unmounted audio still emits recognizable fixture tones',
    )
    result.phase = 'remount'
    await driver.tap('Mount audio probe')
    await driver.waitFor('Audio probe: ready; paused; muted=false')
    await driver.tap('Play audio probe')
    await driver.waitFor('Audio probe: ready; playing; muted=false')
    await capture('remounted', true)
    await driver.story('primitives-shared-showcase--buttons', 'Add one')
    await driver.tap('Add one')
    await driver.waitFor('Pressed 1 times')
    result.passed = true
    driver.record(
      'Android audio removal and fresh remount restore output and leave the app interactive',
    )
  } catch (error) {
    result.error = error.stack
    throw error
  }
}
