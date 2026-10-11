import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { audioFixture } from '../../../examples/showcase/scripts/generate-audio-fixture.mjs'

test('owned audio fixture is reproducible four-second PCM with three quiet tones, not silence', () => {
  const wav = readFileSync(
    new URL('../../../examples/showcase/assets/hozo-audio.wav', import.meta.url),
  )
  assert.ok(wav.equals(audioFixture()))
  assert.equal(wav.subarray(0, 4).toString(), 'RIFF')
  assert.equal(wav.readUInt32LE(24), 16000)
  assert.equal(wav.readUInt16LE(22), 1)
  assert.equal(wav.readUInt32LE(40) / 2 / 16000, 4)
  for (const start of [0.25, 1.25, 2.25]) {
    let squared = 0
    for (let index = 0; index < 4000; index++)
      squared += (wav.readInt16LE(44 + (start * 16000 + index) * 2) / 32768) ** 2
    assert.ok(Math.sqrt(squared / 4000) > 0.06)
  }
})
