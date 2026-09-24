/**
 * The arithmetic a time-of-day control needs, with no `Date` in its types.
 *
 * `calendar-rules.ts` says why a civil date is a plain record rather than a
 * `Date`, and a civil time has the same reason twice over: half past nine is
 * not an instant, and the only way to make it one is to pick a day and a
 * zone that nobody asked for.
 *
 * Everything here goes through seconds-since-midnight, which is the one
 * scalar a time of day has. Stepping, comparing and bounding are then
 * ordinary integer arithmetic, and the wrapping is in one place.
 */

/** Seconds in a day, with no leap second, because a civil clock has none. */
export const SECONDS_IN_DAY = 86_400

export interface CalendarTime {
  /**
   * 0-23, always.
   *
   * A twelve-hour clock is a way of writing a time rather than a way of
   * holding one, so `twelveHour` derives it and nothing stores it. The
   * alternative -- an `hour` that means different things depending on a
   * `period` field beside it -- is a value that cannot be compared without
   * reading two fields in the right order.
   */
  hour: number
  minute: number
  /**
   * Optional, and zero when it is not there.
   *
   * Most pickers never reach seconds and a required field would make every
   * caller write `second: 0`. Every function here reads it as `?? 0`, so a
   * time with one and a time without compare and step the same way.
   */
  second?: number
}

export interface TimeBounds {
  min?: CalendarTime
  max?: CalendarTime
}

/** The one scalar a time of day has. */
export function secondsOfDay(time: CalendarTime): number {
  return time.hour * 3600 + time.minute * 60 + (time.second ?? 0)
}

/**
 * Back from seconds, wrapping at midnight in both directions.
 *
 * A clock is cyclic, so stepping up from 23:59 is 00:00 rather than an
 * error, and stepping down from 00:00 is 23:59. Bounds are a separate
 * question -- `isWithinTime` answers that -- because wrapping is what the
 * clock does and bounding is what the caller asked for.
 */
export function fromSecondsOfDay(seconds: number): CalendarTime {
  const wrapped = ((Math.trunc(seconds) % SECONDS_IN_DAY) + SECONDS_IN_DAY) % SECONDS_IN_DAY
  return {
    hour: Math.floor(wrapped / 3600),
    minute: Math.floor((wrapped % 3600) / 60),
    second: wrapped % 60,
  }
}

/** Negative when `left` is earlier, so it sorts and compares in one shape. */
export function compareTimes(left: CalendarTime, right: CalendarTime): number {
  return secondsOfDay(left) - secondsOfDay(right)
}

export function isSameTime(left: CalendarTime, right: CalendarTime): boolean {
  return compareTimes(left, right) === 0
}

/**
 * Whether a time is inside its bounds.
 *
 * `min` above `max` is not a range that crosses midnight, it is a range with
 * nothing in it. A clock is cyclic but an interval on it is not, and
 * supporting 22:00 to 02:00 here would mean every comparison in this file
 * asking which kind of interval it had been given. A caller who wants that
 * has two ranges and knows it.
 */
export function isWithinTime(time: CalendarTime, bounds: TimeBounds): boolean {
  if (bounds.min && compareTimes(time, bounds.min) < 0) return false
  if (bounds.max && compareTimes(time, bounds.max) > 0) return false
  return true
}

export function addSeconds(time: CalendarTime, seconds: number): CalendarTime {
  return fromSecondsOfDay(secondsOfDay(time) + seconds)
}

export function addMinutes(time: CalendarTime, minutes: number): CalendarTime {
  return addSeconds(time, minutes * 60)
}

/**
 * Whole hours, keeping the minutes.
 *
 * The hour spinbutton moves this and the minute one moves `addMinutes`, so
 * an hour step must not carry a minute with it -- stepping the hour on 09:45
 * is 10:45, not 10:00.
 */
export function addHours(time: CalendarTime, hours: number): CalendarTime {
  return addSeconds(time, hours * 3600)
}

/**
 * Whether a time sits on a step boundary, measured from midnight.
 *
 * Validation rather than correction. A picker with a fifteen-minute step
 * still has to say something about 09:07, and rounding it silently is a
 * decision the component makes rather than the arithmetic.
 */
export function isOnStep(time: CalendarTime, stepMinutes: number): boolean {
  if (!Number.isFinite(stepMinutes) || stepMinutes <= 0) return true
  return secondsOfDay(time) % (stepMinutes * 60) === 0
}

/**
 * Every step from `from` to `to`, inclusive of both when they land on one.
 *
 * What `timeOptions` enumerates for a `Listbox`. Refuses to wrap, for the
 * reason `isWithinTime` gives, and refuses a step of zero, which would not
 * terminate.
 */
export function timesBetween(
  from: CalendarTime,
  to: CalendarTime,
  stepMinutes: number,
): CalendarTime[] {
  if (!Number.isFinite(stepMinutes) || stepMinutes <= 0) return []
  const first = secondsOfDay(from)
  const last = secondsOfDay(to)
  if (last < first) return []
  const step = stepMinutes * 60
  const times: CalendarTime[] = []
  for (let at = first; at <= last; at += step) times.push(fromSecondsOfDay(at))
  return times
}

/** 0 becomes 12 am and 12 becomes 12 pm, which is the part people get wrong. */
export function twelveHour(time: CalendarTime): { hour: number; period: 'am' | 'pm' } {
  const hour = time.hour % 12 === 0 ? 12 : time.hour % 12
  return { hour, period: time.hour < 12 ? 'am' : 'pm' }
}

/**
 * The same hour on the other side of noon, keeping the minutes.
 *
 * What the period spinbutton moves. Written here rather than as `addHours`
 * by twelve at the call site, because "toggle am and pm" is the intent and
 * twelve hours happens to be how it is done.
 */
export function withPeriod(time: CalendarTime, period: 'am' | 'pm'): CalendarTime {
  const current = time.hour < 12 ? 'am' : 'pm'
  if (current === period) return { ...time }
  return { ...time, hour: period === 'pm' ? time.hour + 12 : time.hour - 12 }
}

/**
 * Now where the viewer is, which is the only function here that reads a
 * clock.
 *
 * Local parts rather than UTC ones, for the reason `todayLocal` gives: a
 * time of day is the viewer's own, and a control that opened at the UTC hour
 * would be wrong by nine in Tokyo. Every component takes a prop that
 * overrides it, so a test never depends on when it ran.
 */
export function nowLocal(): CalendarTime {
  const at = new Date()
  return { hour: at.getHours(), minute: at.getMinutes(), second: at.getSeconds() }
}
