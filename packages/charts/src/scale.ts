// Scales: data values to positions, for the chart layer under both
// renderers (RFC 015 §4).
//
// Written here rather than taken from `d3-scale`, which brings `d3-array`,
// `d3-interpolate`, `d3-format` and `d3-time` along. The tick and nice
// arithmetic follows d3 v7's exactly, because the ticks a reader expects on
// an axis are the ones d3 has trained them on; `scale.test.ts` pins d3's
// answers for a set of domains.

export type Range = readonly [number, number]

const E10 = Math.sqrt(50)
const E5 = Math.sqrt(10)
const E2 = Math.sqrt(2)

/**
 * The integer bounds and increment of the ticks in [start, stop]. A
 * negative increment means "divide by its absolute value": a step below 1
 * is kept as its reciprocal so that 0.1 * 3 never prints 0.30000000000000004.
 */
function tickSpec(start: number, stop: number, count: number): [number, number, number] {
  const step = (stop - start) / Math.max(0, count)
  const power = Math.floor(Math.log10(step))
  const error = step / 10 ** power
  const factor = error >= E10 ? 10 : error >= E5 ? 5 : error >= E2 ? 2 : 1
  let i1: number
  let i2: number
  let inc: number
  if (power < 0) {
    inc = 10 ** -power / factor
    i1 = Math.round(start * inc)
    i2 = Math.round(stop * inc)
    if (i1 / inc < start) ++i1
    if (i2 / inc > stop) --i2
    inc = -inc
  } else {
    inc = 10 ** power * factor
    i1 = Math.round(start / inc)
    i2 = Math.round(stop / inc)
    if (i1 * inc < start) ++i1
    if (i2 * inc > stop) --i2
  }
  if (i2 < i1 && 0.5 <= count && count < 2) return tickSpec(start, stop, count * 2)
  return [i1, i2, inc]
}

/** About `count` round values covering [start, stop], in the domain's order. */
export function ticks(start: number, stop: number, count: number): number[] {
  if (!(count > 0) || !Number.isFinite(start) || !Number.isFinite(stop)) return []
  if (start === stop) return [start]
  const reverse = stop < start
  const [i1, i2, inc] = reverse ? tickSpec(stop, start, count) : tickSpec(start, stop, count)
  if (!(i2 >= i1)) return []
  const n = i2 - i1 + 1
  const out = new Array<number>(n)
  for (let i = 0; i < n; i++) {
    const k = reverse ? i2 - i : i1 + i
    out[i] = (inc < 0 ? k / -inc : k * inc) + 0
  }
  return out
}

/** The step between `ticks(start, stop, count)`, negative as in `tickSpec`. */
export function tickIncrement(start: number, stop: number, count: number): number {
  return tickSpec(start, stop, count)[2]
}

/** `[start, stop]` widened outwards to the nearest round ticks. */
export function niceDomain(start: number, stop: number, count = 10): [number, number] {
  if (!Number.isFinite(start) || !Number.isFinite(stop)) return [start, stop]
  const reverse = stop < start
  let lo = reverse ? stop : start
  let hi = reverse ? start : stop
  let previous: number | undefined
  // As d3: the domain changes only once the step has settled, and a step
  // that never settles, or is no step at all, leaves the domain as given.
  for (let iterations = 10; iterations > 0; iterations--) {
    const step = tickIncrement(lo, hi, count)
    // `+ 0` turns -0 into 0, which an axis would otherwise print as "-0".
    if (step === previous) return reverse ? [hi + 0, lo + 0] : [lo + 0, hi + 0]
    if (step > 0) {
      lo = Math.floor(lo / step) * step
      hi = Math.ceil(hi / step) * step
    } else if (step < 0) {
      lo = Math.ceil(lo * step) / step
      hi = Math.floor(hi * step) / step
    } else break
    previous = step
  }
  return [start, stop]
}

export interface LinearScale {
  readonly kind: 'linear'
  readonly domain: Range
  readonly range: Range
  (value: number): number
  invert(position: number): number
  ticks(count?: number): number[]
}

/**
 * A continuous scale. A zero-width domain maps everything to the middle of
 * the range, rather than dividing by zero, so a series of equal values
 * still draws.
 */
export function linearScale(domain: Range, range: Range): LinearScale {
  const [d0, d1] = domain
  const [r0, r1] = range
  const span = d1 - d0
  const map = (value: number) =>
    span === 0 ? (r0 + r1) / 2 : r0 + ((value - d0) / span) * (r1 - r0)
  const invert = (position: number) => (r1 === r0 ? d0 : d0 + ((position - r0) / (r1 - r0)) * span)
  return Object.assign(map, {
    kind: 'linear' as const,
    domain,
    range,
    invert,
    ticks: (count = 10) => ticks(d0, d1, count),
  })
}

export interface BandOptions {
  /** The share of each step left empty between bands, 0 to 1. */
  paddingInner?: number
  /** The space before the first and after the last band, in steps. */
  paddingOuter?: number
  /** Where the bands sit when the padding leaves room, 0 (start) to 1 (end). */
  align?: number
}

export interface BandScale<Key> {
  readonly kind: 'band'
  readonly domain: readonly Key[]
  readonly range: Range
  /** The start of `key`'s band, or `undefined` for a key not in the domain. */
  (key: Key): number | undefined
  readonly bandwidth: number
  readonly step: number
  /** The index of the band at `position`, nearest when between bands. */
  indexAt(position: number): number
}

/** Discrete categories as equal bands along the range, as d3's `scaleBand`. */
export function bandScale<Key>(
  domain: readonly Key[],
  range: Range,
  options: BandOptions = {},
): BandScale<Key> {
  const paddingInner = Math.min(1, Math.max(0, options.paddingInner ?? 0))
  const paddingOuter = Math.max(0, options.paddingOuter ?? 0)
  const align = Math.min(1, Math.max(0, options.align ?? 0.5))
  const n = domain.length
  const reverse = range[1] < range[0]
  let start = reverse ? range[1] : range[0]
  const stop = reverse ? range[0] : range[1]
  const step = (stop - start) / Math.max(1, n - paddingInner + paddingOuter * 2)
  start += (stop - start - step * (n - paddingInner)) * align
  const bandwidth = step * (1 - paddingInner)
  const positions = domain.map((_, i) => start + step * i)
  if (reverse) positions.reverse()
  const index = new Map<Key, number>()
  domain.forEach((key, i) => {
    if (!index.has(key)) index.set(key, i)
  })
  const map = (key: Key) => {
    const i = index.get(key)
    return i === undefined ? undefined : positions[i]
  }
  const indexAt = (position: number) => {
    if (n === 0) return -1
    let best = 0
    let distance = Number.POSITIVE_INFINITY
    for (let i = 0; i < n; i++) {
      const d = Math.abs((positions[i] as number) + bandwidth / 2 - position)
      if (d < distance) {
        distance = d
        best = i
      }
    }
    return best
  }
  return Object.assign(map, { kind: 'band' as const, domain, range, bandwidth, step, indexAt })
}

/**
 * Discrete categories as points, as d3's `scalePoint`: a band scale whose
 * bands have no width, so a Line's vertices sit on the category.
 */
export function pointScale<Key>(
  domain: readonly Key[],
  range: Range,
  options: { padding?: number; align?: number } = {},
): BandScale<Key> {
  return bandScale(domain, range, {
    paddingInner: 1,
    paddingOuter: options.padding ?? 0,
    align: options.align,
  })
}
