/**
 * Where a `<meter>`'s amount sits and which of its three colours it gets,
 * worked out the way the browser does, so React Native can draw the bar the
 * Web is given for free.
 *
 * The clamping follows the HTML standard's `<meter>` attributes: the range is
 * 0 to 1 when left out, `max` is never below `min`, `value` and `optimum` sit
 * inside the range, `low` inside it, and `high` between `low` and `max`. The
 * regions are the browser's: an optimum between `low` and `high` makes that
 * middle stretch good and both sides fair; an optimum beyond either boundary
 * makes its own end good, the middle fair and the far end poor. A boundary
 * belongs to the better side, every time -- read off Chromium's own pixels
 * for 110 combinations, which is what the tests' edge cases are.
 */

export type MeterRegion = 'optimum' | 'suboptimal' | 'even-less-good'

export interface MeterGauge {
  /** How far along the range the amount is, 0 to 1. */
  fraction: number
  region: MeterRegion
}

export interface MeterRange {
  value: number
  min?: number
  max?: number
  low?: number
  high?: number
  optimum?: number
}

const clamp = (value: number, lowest: number, highest: number) =>
  Math.min(Math.max(value, lowest), highest)

export function meterGauge({ value, min, max, low, high, optimum }: MeterRange): MeterGauge {
  const start = min ?? 0
  const end = Math.max(start, max ?? 1)
  const amount = clamp(value, start, end)
  const lowBound = clamp(low ?? start, start, end)
  const highBound = clamp(high ?? end, lowBound, end)
  const best = clamp(optimum ?? (start + end) / 2, start, end)
  const fraction = end === start ? 0 : (amount - start) / (end - start)

  let region: MeterRegion
  if (lowBound <= best && best <= highBound) {
    region = lowBound <= amount && amount <= highBound ? 'optimum' : 'suboptimal'
  } else if (highBound < best) {
    region = highBound <= amount ? 'optimum' : lowBound <= amount ? 'suboptimal' : 'even-less-good'
  } else {
    region = amount <= lowBound ? 'optimum' : amount <= highBound ? 'suboptimal' : 'even-less-good'
  }
  return { fraction, region }
}
