import assert from 'node:assert/strict'

// Search the whole fixture/shifted frequency catalog, not only the requested
// profile. Ignored pitch/rate settings must remain visible as wrong output.
export const AUDIO_SETTINGS_LIMITS = Object.freeze({
  frequencies: [220, 330, 440, 660, 880, 1320, 1760],
  windowSeconds: 0.04,
  minimumRms: 4 / 32768,
  minimumCoherence: 0.8,
  minimumSeconds: 11.5,
  rateTolerance: 0.2,
  quarterGain: [0.18, 0.32],
  restoredGain: [0.8, 1.2],
})
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/** Only recorded frames feed this result; no authored rate or engine getter. */
export function audioSettingsMetrics({ rate, samples }) {
  const limits = AUDIO_SETTINGS_LIMITS
  const size = Math.round(rate * limits.windowSeconds)
  const windows = []
  let peak = 0
  let energy = 0
  for (const channel of samples)
    for (const value of channel) {
      peak = Math.max(peak, Math.abs(value))
      energy += value * value
    }
  for (let start = 0; start + size <= samples[0].length; start += size) {
    let winner = null
    for (const channel of samples) {
      let squared = 0
      for (let index = start; index < start + size; index++) squared += channel[index] ** 2
      const rms = Math.sqrt(squared / size)
      if (rms < limits.minimumRms) continue
      for (const frequency of limits.frequencies) {
        const coefficient = 2 * Math.cos((2 * Math.PI * frequency) / rate)
        let previous = 0
        let before = 0
        for (let index = start; index < start + size; index++) {
          const next = channel[index] + coefficient * previous - before
          before = previous
          previous = next
        }
        const power = Math.max(0, previous ** 2 + before ** 2 - coefficient * previous * before)
        const coherence = (2 * Math.sqrt(power)) / size / (Math.SQRT2 * rms)
        if (coherence >= limits.minimumCoherence && (!winner || coherence > winner.coherence))
          winner = { frequency, coherence, rms }
      }
    }
    windows.push(winner ? { time: start / rate, ...winner } : null)
  }
  const pulses = []
  let pulse = null
  for (let index = 0; index < windows.length; index++) {
    const window = windows[index]
    if (!window) {
      pulse = null
      continue
    }
    if (!pulse || pulse.frequency !== window.frequency) {
      pulse = {
        frequency: window.frequency,
        start: window.time,
        end: window.time,
        rmsWindows: [],
        coherenceWindows: [],
      }
      pulses.push(pulse)
    }
    pulse.end = ((index + 1) * size) / rate
    pulse.rmsWindows.push(window.rms)
    pulse.coherenceWindows.push(window.coherence)
  }
  const duration = samples[0].length / rate
  return {
    duration,
    peak,
    rms: duration ? Math.sqrt(energy / samples[0].length / samples.length) : 0,
    pulses: pulses
      .filter((p) => p.rmsWindows.length >= 2)
      .map((p) => ({
        frequency: p.frequency,
        start: p.start,
        end: p.end,
        rms: median(p.rmsWindows),
        coherence: median(p.coherenceWindows),
        clipped: p.start < limits.windowSeconds || p.end > duration - limits.windowSeconds,
      })),
  }
}

export function verifyAudioSettings(metrics, { playbackRate, preservesPitch }) {
  const limits = AUDIO_SETTINGS_LIMITS
  assert.ok(metrics.duration >= limits.minimumSeconds, 'insufficient settings output frames')
  const scale = preservesPitch ? 1 : playbackRate
  const frequencies = [440, 660, 880].map((frequency) => frequency * scale)
  const pulses = metrics.pulses.filter((pulse) => !pulse.clipped)
  assert.ok(pulses.length >= 3, 'insufficient complete tone pulses')
  for (const frequency of frequencies)
    assert.ok(
      pulses.some((p) => p.frequency === frequency),
      `expected ${frequency}Hz output missing`,
    )
  const measuredRates = []
  for (let index = 0; index < pulses.length; index++) {
    const previous = pulses[index - 1]
    const current = pulses[index]
    const note = frequencies.indexOf(current.frequency)
    assert.ok(note >= 0, `unexpected output frequency ${current.frequency}Hz`)
    if (!previous) continue
    const previousNote = frequencies.indexOf(previous.frequency)
    assert.equal(note, (previousNote + 1) % 3, 'output notes changed order or lost a pulse')
    // Owned source onset gaps are 1, 1, 2 seconds, including its silent tail.
    const sourceGap = previousNote === 2 ? 2 : 1
    const measuredRate = sourceGap / (current.start - previous.start)
    assert.ok(
      Math.abs(measuredRate - playbackRate) <= playbackRate * limits.rateTolerance,
      `output pulse rate ${measuredRate} does not match ${playbackRate}`,
    )
    measuredRates.push(measuredRate)
  }
  assert.ok(measuredRates.length >= 2, 'insufficient independent output intervals')
  return {
    frequencies,
    measuredRates,
    medianRate: median(measuredRates),
    toneRms: Object.fromEntries(
      frequencies.map((frequency) => [
        frequency,
        median(pulses.filter((p) => p.frequency === frequency).map((p) => p.rms)),
      ]),
    ),
  }
}

export function verifyRelativeGain(baseline, measured, bounds) {
  const ratios = {}
  for (const frequency of [440, 660, 880]) {
    const ratio = measured.toneRms[frequency] / baseline.toneRms[frequency]
    assert.ok(
      Number.isFinite(ratio) && ratio >= bounds[0] && ratio <= bounds[1],
      `${frequency}Hz relative output gain ${ratio} is outside ${bounds}`,
    )
    ratios[frequency] = ratio
  }
  return ratios
}
