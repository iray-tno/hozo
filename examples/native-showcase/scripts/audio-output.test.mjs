import assert from 'node:assert/strict'
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { audioFixture } from '../../showcase/scripts/generate-audio-fixture.mjs'
import {
  audioMetrics,
  exerciseAudioOutput,
  outputPCM,
  verifyAudio,
  wavSnapshot,
} from './audio-output.mjs'
import { readAndroidScenario } from './svg-filter-evidence.mjs'

const original = audioFixture().subarray(44)
const repeated = Buffer.concat([original, original])
const wav = (bytes = repeated, channels = 1) => wavSnapshot({ bytes, rate: 16000, channels })
const metrics = (bytes) => audioMetrics(outputPCM(wav(bytes)))
const attenuate = (input, gain) => {
  const bytes = Buffer.alloc(input.length)
  for (let index = 0; index < input.length; index += 2)
    bytes.writeInt16LE(Math.round(input.readInt16LE(index) * gain), index)
  return bytes
}

test('live emulator WAV lengths can be unfinished; snapshots preserve actual PCM with valid sizes', () => {
  const live = wav()
  live.writeUInt32LE(0, 4)
  live.writeUInt32LE(0, 40)
  const pcm = outputPCM(live)
  assert.equal(pcm.samples[0].length, 8 * 16000)
  assert.ok(wavSnapshot(pcm).equals(wav()))
  const later = outputPCM(live, 44 + 4 * 16000 * 2)
  assert.equal(later.samples[0].length, 4 * 16000)
  assert.throws(() => outputPCM(live, 45))
  assert.throws(() => outputPCM(live, live.length + 2), /truncated/)
  for (const [offset, value] of [
    [20, 3],
    [22, 3],
    [32, 1],
    [34, 8],
  ]) {
    const corrupt = Buffer.from(live)
    corrupt.writeUInt16LE(value, offset)
    assert.throws(() => outputPCM(corrupt))
  }
  assert.throws(() => outputPCM(Buffer.alloc(44)))
})

test('owned looped tones pass; silence, one note, wrong order and unrelated noise do not', () => {
  const observed = metrics(repeated)
  verifyAudio(observed, true)
  assert.deepEqual(observed.toneSequence, [440, 660, 880, 440, 660, 880])
  assert.throws(() => verifyAudio(observed, false), /not silent/)
  const silence = metrics(Buffer.alloc(repeated.length))
  verifyAudio(silence, false)
  assert.throws(() => verifyAudio(silence, true), /tone missing/)
  assert.throws(() => verifyAudio(metrics(Buffer.alloc(0)), false), /insufficient/)
  const second = 16000 * 2
  const wrongOrder = Buffer.concat([
    original.subarray(second, 2 * second),
    original.subarray(0, second),
    original.subarray(2 * second),
  ])
  assert.throws(() => verifyAudio(metrics(Buffer.concat([wrongOrder, wrongOrder])), true), /order/)
  const oneTone = Buffer.concat(Array(8).fill(original.subarray(0, second)))
  assert.throws(() => verifyAudio(metrics(oneTone), true), /660Hz tone missing/)
  const noise = Buffer.alloc(repeated.length)
  let random = 12345
  for (let index = 0; index < noise.length; index += 2) {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0
    noise.writeInt16LE((random % 8000) - 4000, index)
  }
  assert.throws(() => verifyAudio(metrics(noise), true), /tone missing/)
  assert.throws(() => verifyAudio(metrics(attenuate(noise, 1 / 64)), true), /tone missing/)
})

test('stereo cancellation and sound in a short final fragment cannot satisfy silence', () => {
  const stereo = Buffer.alloc(repeated.length * 2)
  for (let index = 0; index < repeated.length / 2; index++) {
    const sample = repeated.readInt16LE(index * 2)
    stereo.writeInt16LE(sample, index * 4)
    stereo.writeInt16LE(-sample, index * 4 + 2)
  }
  const observed = audioMetrics(outputPCM(wav(stereo, 2)))
  verifyAudio(observed, true)
  assert.throws(() => verifyAudio(observed, false), /not silent/)
  const tail = Buffer.alloc(16000 * 6 * 2 + 2)
  tail.writeInt16LE(32767, tail.length - 2)
  assert.throws(() => verifyAudio(metrics(tail), false), /not silent/)
})

test('mixer attenuation preserves tone identity; quiet output cannot also count as muted silence', () => {
  for (const gain of [1 / 16, 1 / 32, 1 / 64]) {
    const quiet = metrics(attenuate(repeated, gain))
    verifyAudio(quiet, true)
    assert.deepEqual(quiet.toneSequence, [440, 660, 880, 440, 660, 880])
    assert.throws(() => verifyAudio(quiet, false), /not silent|recognizable/)
  }
  // Sparse leaked tones can sit below the whole-recording silence RMS/peak
  // limits. Their recognizable spectral shape must still reject mute.
  const leak = Buffer.alloc(16000 * 6 * 2)
  attenuate(original.subarray(16000, 16000 + 1600 * 2), 1 / 64).copy(leak)
  const observed = metrics(leak)
  assert.ok(observed.rms < 0.0005 && observed.peak < 0.003)
  assert.throws(() => verifyAudio(observed, false), /recognizable/)
  const tiny = metrics(attenuate(repeated, 1 / 1024))
  assert.throws(() => verifyAudio(tiny, true), /tone missing/)
  const wrongOrder = Buffer.concat([
    original.subarray(32000, 64000),
    original.subarray(0, 32000),
    original.subarray(64000),
  ])
  assert.throws(
    () => verifyAudio(metrics(attenuate(Buffer.concat([wrongOrder, wrongOrder]), 1 / 64)), true),
    /order/,
  )
})

function driverHarness(t, failure = false) {
  const output = mkdtempSync(join(tmpdir(), 'hozo-audio-output-'))
  t.after(() => rmSync(output, { recursive: true, force: true }))
  const file = join(output, 'output.wav')
  writeFileSync(file, wav(Buffer.alloc(0)))
  const actions = []
  const checks = []
  let playing = false
  let muted = false
  const driver = {
    story: async (id) => actions.push(id),
    waitFor: async () => {},
    tap: async (name) => {
      actions.push(name)
      if (name === 'Play audio probe') playing = true
      if (name === 'Mute audio probe') muted = true
      if (name === 'Unmute audio probe') muted = false
      if (name === 'Remove audio probe') playing = false
    },
    record: (name) => checks.push(name),
  }
  const sleep = async (ms) => {
    const bytes = Math.round((ms / 1000) * 16000 * 2)
    if (!playing || muted || failure) appendFileSync(file, Buffer.alloc(bytes))
    else appendFileSync(file, repeated.subarray(0, bytes))
  }
  return { output, file, actions, checks, driver, sleep }
}

test('output protocol retains every capture and checks mute, restore, removal and fresh output', async (t) => {
  const h = driverHarness(t)
  const evidence = {}
  await exerciseAudioOutput(h.driver, evidence, h.file, h.output, { sleep: h.sleep })
  assert.equal(evidence.audioOutput.passed, true)
  assert.equal(h.checks.length, 3)
  assert.deepEqual(
    evidence.audioOutput.captures.map((capture) => capture.phase),
    ['playing', 'muted', 'unmuted', 'remounted'],
  )
  for (const capture of evidence.audioOutput.captures)
    assert.equal(audioMetrics(outputPCM(readFileSync(join(h.output, capture.name)))).duration, 6)
  assert.ok(h.actions.includes('Remove audio probe'))
  assert.ok(h.actions.includes('Mount audio probe'))
  assert.equal(evidence.audioOutput.fixtureSha256.length, 64)
  assert.deepEqual(evidence.audioOutput.toneDetection, {
    minimumWindowRms: 16 / 32768,
    minimumCoherence: 0.85,
  })
})

test('silence at the first output stage fails immediately without repeating play or discarding its capture', async (t) => {
  const h = driverHarness(t, true)
  const evidence = {}
  await assert.rejects(
    exerciseAudioOutput(h.driver, evidence, h.file, h.output, { sleep: h.sleep }),
    /tone missing/,
  )
  assert.equal(evidence.audioOutput.passed, false)
  assert.equal(evidence.audioOutput.phase, 'playing')
  assert.equal(evidence.audioOutput.captures.length, 1)
  assert.match(evidence.audioOutput.error, /tone missing/)
  assert.equal(h.actions.filter((action) => action === 'Play audio probe').length, 1)
  assert.equal(h.checks.length, 0)
})

test('quiet leaked tones abort mute and removal without proceeding to unmute or remount', async (t) => {
  for (const phase of ['muted', 'remove']) {
    const h = driverHarness(t)
    const evidence = {}
    const leak = attenuate(original.subarray(16000, 16000 + 1600 * 2), 1 / 64)
    const sleep = async (ms) => {
      await h.sleep(ms)
      if (evidence.audioOutput.phase === phase && ms === (phase === 'muted' ? 6000 : 3000))
        appendFileSync(h.file, leak)
    }
    await assert.rejects(
      exerciseAudioOutput(h.driver, evidence, h.file, h.output, { sleep }),
      /recognizable fixture tones/,
    )
    assert.equal(evidence.audioOutput.passed, false)
    assert.equal(evidence.audioOutput.phase, phase)
    assert.ok(!h.actions.includes(phase === 'muted' ? 'Unmute audio probe' : 'Mount audio probe'))
    assert.equal(h.checks.length, phase === 'muted' ? 1 : 2)
  }
})

test('audio diagnosis is isolated, capture-enabled and does not change full/SVG or release evidence', () => {
  assert.equal(readAndroidScenario('audio-output'), 'audio-output')
  const workflow = readFileSync(
    new URL('../../../.github/workflows/native-showcase.yml', import.meta.url),
    'utf8',
  )
  assert.match(workflow, /options: \[full, svg-filters, audio-output, audio-settings\]/)
  assert.match(
    workflow,
    /\(inputs.android-scenario == 'audio-output' \|\| inputs.android-scenario == 'audio-settings'\) && '-verbose' \|\| '-noaudio'/,
  )
  assert.match(workflow, /QEMU_AUDIO_DRV=wav/)
  assert.match(workflow, /QEMU_WAV_PATH=/)
  assert.match(workflow, /hozo-native-showcase-android-audio-evidence/)
  assert.match(workflow, /script: node examples\/native-showcase\/scripts\/android-scenarios\.mjs/)
})
