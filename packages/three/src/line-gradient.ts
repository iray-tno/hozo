interface LinearRGB {
  r: number
  g: number
  b: number
}

interface Stop {
  readonly offset: number
  readonly color: string
}

const maximumStops = 32
const cache = new Map<string, readonly Stop[]>()
// A small table avoids three pow calls per refinement sample. Interpolation
// preserves sub-byte precision, including the steep dark end of the curve.
const encoded = Float32Array.from({ length: 4097 }, (_, index) => {
  const value = index / 4096
  return 255 * (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055)
})

function channel(value: number): number {
  const position = Math.max(0, Math.min(1, value)) * 4096
  const index = Math.floor(position)
  return index === 4096
    ? 255
    : encoded[index]! + (encoded[index + 1]! - encoded[index]!) * (position - index)
}

function css(r: number, g: number, b: number): string {
  return `#${((Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)).toString(16).padStart(6, '0')}`
}

/** Bounded approximation of opaque linear-RGB, perspective-correct line colour. */
export function portableLineColorStops(
  from: LinearRGB,
  to: LinearRGB,
  fromW: number,
  toW: number,
  projectedLength: number,
): readonly Stop[] {
  const budget = Math.max(2, Math.min(maximumStops, 1 + Math.ceil(projectedLength / 2)))
  const depthRatio = toW / fromW
  // Position is deliberately absent: translating an edge can reuse its stops.
  // The bounded cache cannot grow with the number of animation frames.
  const key = `${from.r},${from.g},${from.b},${to.r},${to.g},${to.b},${depthRatio},${budget}`
  const previous = cache.get(key)
  if (previous) return previous

  if (budget === 2 || (from.r === to.r && from.g === to.g && from.b === to.b)) {
    const stops = Object.freeze([
      Object.freeze({ offset: 0, color: css(channel(from.r), channel(from.g), channel(from.b)) }),
      Object.freeze({ offset: 1, color: css(channel(to.r), channel(to.g), channel(to.b)) }),
    ])
    if (cache.size >= 256) cache.delete(cache.keys().next().value!)
    cache.set(key, stops)
    return stops
  }

  const positions = new Float64Array(maximumStops)
  const colors = new Float64Array(maximumStops * 3)
  const errors = new Float64Array(maximumStops)
  const splits = new Float64Array(maximumStops)
  const dr = to.r - from.r
  const dg = to.g - from.g
  const db = to.b - from.b
  const sourceRatio = (s: number) => s / ((1 - s) * depthRatio + s)
  const evaluate = (index: number, position: number) => {
    positions[index] = position
    const t = sourceRatio(position)
    colors[index * 3] = channel(from.r + dr * t)
    colors[index * 3 + 1] = channel(from.g + dg * t)
    colors[index * 3 + 2] = channel(from.b + db * t)
  }
  const intervalError = (index: number) => {
    let error = 0
    let split = 0
    for (let fraction = 0.25; fraction < 1; fraction += 0.25) {
      const position = positions[index]! + (positions[index + 1]! - positions[index]!) * fraction
      const t = sourceRatio(position)
      const at = index * 3
      const largest = Math.max(
        Math.abs(
          channel(from.r + dr * t) - (colors[at]! + (colors[at + 3]! - colors[at]!) * fraction),
        ),
        Math.abs(
          channel(from.g + dg * t) -
            (colors[at + 1]! + (colors[at + 4]! - colors[at + 1]!) * fraction),
        ),
        Math.abs(
          channel(from.b + db * t) -
            (colors[at + 2]! + (colors[at + 5]! - colors[at + 2]!) * fraction),
        ),
      )
      if (largest > error) {
        error = largest
        split = position
      }
    }
    errors[index] = error
    splits[index] = split
  }
  evaluate(0, 0)
  evaluate(1, 1)
  let count = 2
  intervalError(0)
  while (count < budget) {
    let index = 0
    for (let candidate = 1; candidate < count - 1; candidate += 1)
      if (errors[candidate]! > errors[index]!) index = candidate
    // Sub-byte accuracy is not a host-pixel guarantee: CSS stops are quantized
    // and short edges can exhaust their screen-length budget first.
    if (errors[index]! <= 1) break
    const position = splits[index]!
    positions.copyWithin(index + 2, index + 1, count)
    colors.copyWithin((index + 2) * 3, (index + 1) * 3, count * 3)
    errors.copyWithin(index + 2, index + 1, count - 1)
    splits.copyWithin(index + 2, index + 1, count - 1)
    evaluate(index + 1, position)
    count += 1
    intervalError(index)
    intervalError(index + 1)
  }
  const stops = Object.freeze(
    Array.from({ length: count }, (_, index) =>
      Object.freeze({
        offset: positions[index]!,
        color: css(colors[index * 3]!, colors[index * 3 + 1]!, colors[index * 3 + 2]!),
      }),
    ),
  )
  if (cache.size >= 256) cache.delete(cache.keys().next().value!)
  cache.set(key, stops)
  return stops
}
