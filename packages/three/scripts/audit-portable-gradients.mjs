import { Color } from 'three'

const red = new Color(1, 0, 0)
const green = new Color(0, 1, 0)
const encoded = (position, depthRatio) => {
  const ratio = position / ((1 - position) * depthRatio + position)
  const color = red.clone().lerp(green, ratio).convertLinearToSRGB()
  return [color.r, color.g, color.b].map((value) => value * 255)
}

function buildStops(depthRatio, adaptive) {
  const stops = [
    { position: 0, color: encoded(0, depthRatio) },
    { position: 1, color: encoded(1, depthRatio) },
  ]
  if (adaptive) {
    const intervalError = (a, b) => {
      let largest = { error: 0, position: 0 }
      for (const fraction of [0.25, 0.5, 0.75]) {
        const position = a.position + (b.position - a.position) * fraction
        const reference = encoded(position, depthRatio)
        const error = Math.max(
          ...reference.map((value, channel) =>
            Math.abs(value - (a.color[channel] * (1 - fraction) + b.color[channel] * fraction)),
          ),
        )
        if (error > largest.error) largest = { error, position }
      }
      return largest
    }
    const intervals = [intervalError(stops[0], stops[1])]
    // Prototype only: bounded stop refinement, not a production guarantee.
    while (stops.length < 32) {
      let interval = 0
      for (let index = 1; index < intervals.length; index += 1)
        if (intervals[index].error > intervals[interval].error) interval = index
      const largest = intervals[interval]
      if (largest.error <= 1) break
      const next = { position: largest.position, color: encoded(largest.position, depthRatio) }
      const a = stops[interval],
        b = stops[interval + 1]
      stops.splice(interval + 1, 0, next)
      // Existing interval errors do not change when another interval splits.
      intervals.splice(interval, 1, intervalError(a, next), intervalError(next, b))
    }
  }
  return stops
}

function evaluate(depthRatio, adaptive) {
  const started = performance.now()
  const stops = buildStops(depthRatio, adaptive)
  const buildMs = performance.now() - started
  let maxError = 0
  let interval = 0
  for (let sample = 0; sample <= 4096; sample += 1) {
    const position = sample / 4096
    while (interval + 2 < stops.length && stops[interval + 1].position < position) interval += 1
    const a = stops[interval],
      b = stops[interval + 1]
    const ratio = (position - a.position) / (b.position - a.position)
    const reference = encoded(position, depthRatio)
    // Quantized CSS stops, not an ideal float-only gradient.
    for (let channel = 0; channel < 3; channel += 1)
      maxError = Math.max(
        maxError,
        Math.abs(
          reference[channel] -
            (Math.round(a.color[channel]) * (1 - ratio) + Math.round(b.color[channel]) * ratio),
        ),
      )
  }
  return { depthRatio, stopCount: stops.length, maximumChannelError: maxError, buildMs }
}

function benchmark(adaptive) {
  const ratios = [1, 2, 4, 16, 100]
  for (let index = 0; index < 100; index += 1) buildStops(ratios[index % ratios.length], adaptive)
  const trials = []
  for (let trial = 0; trial < 5; trial += 1) {
    const started = performance.now()
    for (let index = 0; index < 1000; index += 1)
      buildStops(ratios[index % ratios.length], adaptive)
    trials.push(performance.now() - started)
  }
  trials.sort((a, b) => a - b)
  return { lines: 1000, trials: 5, medianPreparationMs: trials[2] }
}
console.log(
  JSON.stringify(
    {
      samplesPerLine: 4097,
      rows: [1, 2, 4, 16, 100].map((ratio) => ({
        baseline: evaluate(ratio, false),
        boundedPrototype: evaluate(ratio, true),
      })),
      preparationOnlyBenchmark: { baseline: benchmark(false), boundedPrototype: benchmark(true) },
    },
    null,
    2,
  ),
)
