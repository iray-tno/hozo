import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** Original reproducible quiet tone sequence; no external recording or codec tool. */
export function audioFixture() {
  const rate = 16000
  const count = rate * 4
  const wav = Buffer.alloc(44 + count * 2)
  wav.write('RIFF')
  wav.writeUInt32LE(wav.length - 8, 4)
  wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(rate, 24)
  wav.writeUInt32LE(rate * 2, 28)
  wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(count * 2, 40)
  for (let sample = 0; sample < count; sample++) {
    const time = sample / rate
    const note = Math.floor(time)
    const phase = time - note - 0.25
    if (note >= 3 || phase < 0 || phase >= 0.4) continue
    const ramp = Math.min(1, phase / 0.01, (0.4 - phase) / 0.01)
    const value = 0.12 * ramp * Math.sin(2 * Math.PI * [440, 660, 880][note] * phase)
    wav.writeInt16LE(Math.round(value * 32767), 44 + sample * 2)
  }
  return wav
}

if (import.meta.filename === process.argv[1]) {
  const file = fileURLToPath(new URL('../assets/hozo-audio.wav', import.meta.url))
  writeFileSync(file, audioFixture())
  console.log(`Generated ${file}`)
}
