// A time axis: rows placed by when they happened rather than one step
// apart, with ticks on calendar boundaries (RFC 015 §4).
//
// In UTC by default. A chart is rendered on the server and again in the
// browser, and a tick that moves to the reader's zone on hydration would
// differ between the two; data given as dates ("2026-03-01") is UTC to
// `Date.parse` already. `timeZone: 'local'` reads the reader's zone.

import type { Range } from './scale.ts'

export type TimeZone = 'utc' | 'local'

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** A row's time in milliseconds: a `Date`, a number, or a string `Date.parse` reads. */
export function timeValue(value: unknown): number | undefined {
  const ms =
    value instanceof Date
      ? value.getTime()
      : typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Date.parse(value)
          : Number.NaN
  return Number.isFinite(ms) ? ms : undefined
}

type Unit = 'minute' | 'hour' | 'day' | 'month' | 'year'

interface Interval {
  unit: Unit
  step: number
  /** Roughly how long it is, for choosing one. */
  approx: number
}

// The steps a reader counts in, as d3's time ticks offer them.
const INTERVALS: Interval[] = [
  ...[1, 5, 15, 30].map((step) => ({ unit: 'minute' as const, step, approx: step * MINUTE })),
  ...[1, 3, 6, 12].map((step) => ({ unit: 'hour' as const, step, approx: step * HOUR })),
  ...[1, 2, 7].map((step) => ({ unit: 'day' as const, step, approx: step * DAY })),
  ...[1, 3, 6].map((step) => ({ unit: 'month' as const, step, approx: step * 30 * DAY })),
  ...[1, 2, 5, 10, 25, 50, 100].map((step) => ({
    unit: 'year' as const,
    step,
    approx: step * 365 * DAY,
  })),
]

/** The calendar fields of `ms` in the zone, and back. */
function fields(ms: number, zone: TimeZone) {
  const d = new Date(ms)
  return zone === 'utc'
    ? [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes()]
    : [d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]
}

function weekday(ms: number, zone: TimeZone): number {
  return zone === 'utc' ? new Date(ms).getUTCDay() : new Date(ms).getDay()
}

function compose(zone: TimeZone, y: number, mo = 0, d = 1, h = 0, mi = 0): number {
  return zone === 'utc' ? Date.UTC(y, mo, d, h, mi) : new Date(y, mo, d, h, mi).getTime()
}

/** The first boundary of `interval` at or after `ms`. */
function ceilTo(ms: number, interval: Interval, zone: TimeZone): number {
  const [y, mo, d, h, mi] = fields(ms, zone) as [number, number, number, number, number]
  const { unit, step } = interval
  // The boundary at or before `ms`, then forward until it is not before.
  const down = (value: number, base = 0) => base + Math.floor((value - base) / step) * step
  const week = unit === 'day' && step === 7
  let at = {
    minute: () => compose(zone, y, mo, d, h, down(mi)),
    hour: () => compose(zone, y, mo, d, down(h)),
    // A week starts on a Monday; other day steps count from the 1st.
    day: () => compose(zone, y, mo, week ? d : down(d, 1)),
    month: () => compose(zone, y, down(mo)),
    year: () => compose(zone, down(y)),
  }[unit]()
  const next = week ? { unit: 'day' as const, step: 1, approx: DAY } : interval
  while (at < ms || (week && weekday(at, zone) !== 1)) at = advance(at, next, zone)
  return at
}

function advance(ms: number, interval: Interval, zone: TimeZone): number {
  const [y, mo, d, h, mi] = fields(ms, zone) as [number, number, number, number, number]
  const { unit, step } = interval
  switch (unit) {
    case 'minute':
      return compose(zone, y, mo, d, h, mi + step)
    case 'hour':
      return compose(zone, y, mo, d, h + step)
    case 'day':
      return compose(zone, y, mo, d + step)
    case 'month':
      return compose(zone, y, mo + step)
    case 'year':
      return compose(zone, y + step)
  }
}

export interface TimeTick {
  value: number
  label: string
}

/**
 * About `count` ticks on calendar boundaries in `[start, stop]`, each
 * labelled as briefly as its step allows. A month shows its year where the
 * year turns and on the first tick; an hour shows its day the same way.
 */
export function timeTicks(
  start: number,
  stop: number,
  count: number,
  zone: TimeZone = 'utc',
  locale = 'en-US',
): TimeTick[] {
  if (!(stop > start) || !(count > 0)) return []
  const target = (stop - start) / count
  // The step nearest the target by ratio, as d3 picks it: 9 days is nearer a
  // week than a month.
  const above = INTERVALS.findIndex((entry) => entry.approx >= target)
  const below = INTERVALS[above - 1]
  const interval =
    above < 0
      ? (INTERVALS.at(-1) as Interval)
      : below && target / below.approx < (INTERVALS[above] as Interval).approx / target
        ? below
        : (INTERVALS[above] as Interval)
  const values: number[] = []
  for (let at = ceilTo(start, interval, zone); at <= stop; at = advance(at, interval, zone)) {
    values.push(at)
    if (values.length > 1000) break
  }
  const opts = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...options, timeZone: zone === 'utc' ? 'UTC' : undefined })
  const year = opts({ year: 'numeric' })
  const month = opts({ month: 'short' })
  const monthYear = opts({ month: 'short', year: 'numeric' })
  const day = opts({ month: 'short', day: 'numeric' })
  const time = opts({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const dayTime = opts({
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  return values.map((value, i) => {
    const previous = values[i - 1]
    const turns = (index: number) =>
      previous === undefined || fields(previous, zone)[index] !== fields(value, zone)[index]
    const label =
      interval.unit === 'year'
        ? year.format(value)
        : interval.unit === 'month'
          ? (turns(0) ? monthYear : month).format(value)
          : interval.unit === 'day'
            ? day.format(value)
            : (turns(2) ? dayTime : time).format(value)
    return { value, label }
  })
}

/**
 * How a row's time is read in the table and the summary: the date, with
 * the time of day when any row has one.
 */
export function timeFormatter(
  times: readonly (number | undefined)[],
  zone: TimeZone = 'utc',
  locale = 'en-US',
): (ms: number) => string {
  const withTime = times.some((ms) => {
    if (ms === undefined) return false
    const [, , , h, mi] = fields(ms, zone)
    return h !== 0 || mi !== 0
  })
  const format = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } : {}),
    timeZone: zone === 'utc' ? 'UTC' : undefined,
  })
  return (ms) => format.format(ms)
}

/** A time domain widened by nothing: the first and last row are the ends. */
export function timeDomain(times: readonly (number | undefined)[]): Range | undefined {
  let lo = Number.POSITIVE_INFINITY
  let hi = Number.NEGATIVE_INFINITY
  for (const ms of times)
    if (ms !== undefined) {
      lo = Math.min(lo, ms)
      hi = Math.max(hi, ms)
    }
  return lo <= hi ? [lo, hi === lo ? lo + DAY : hi] : undefined
}
