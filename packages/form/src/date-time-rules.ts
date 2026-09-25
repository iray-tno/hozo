/**
 * A civil date and a civil time, held as one value.
 *
 * `CalendarDateTime` is an intersection rather than a pair. `{ date, time }`
 * would read as two things and force every caller to take them apart again;
 * a flat record is assignable wherever a `CalendarDate` or a `CalendarTime`
 * is wanted, which is how `Calendar` and `TimePicker` each take the whole
 * value unchanged and only `onChange` has anything to merge.
 *
 * Still not a `Date`, for the reason the other two records are not: half past
 * nine on the 24th of September is not an instant until a zone is chosen, and
 * choosing one on the caller's behalf is how a picker ends up saving the day
 * before.
 */

import { type CalendarDate, compareDates, isSameDay, toTimestamp } from './calendar-rules.ts'
import { type CalendarTime, compareTimes, secondsOfDay, type TimeBounds } from './time-rules.ts'

export type CalendarDateTime = CalendarDate & CalendarTime

export interface DateTimeBounds {
  min?: CalendarDateTime
  max?: CalendarDateTime
}

/** The day alone, as its own record, for a caller that wants only that. */
export function dateOf(value: CalendarDateTime): CalendarDate {
  return { year: value.year, month: value.month, day: value.day }
}

/** The time alone. `second` is carried only when the value had one. */
export function timeOf(value: CalendarDateTime): CalendarTime {
  const time: CalendarTime = { hour: value.hour, minute: value.minute }
  return value.second === undefined ? time : { ...time, second: value.second }
}

/** The same time, on another day. */
export function withDate(value: CalendarDateTime, date: CalendarDate): CalendarDateTime {
  return { ...value, ...date }
}

/**
 * The same day, at another time.
 *
 * `second` is dropped when the new time has none, rather than left behind
 * from the old one: a picker that shows hours and minutes would otherwise
 * keep an invisible 43 seconds through every edit.
 */
export function withTime(value: CalendarDateTime, time: CalendarTime): CalendarDateTime {
  return { ...dateOf(value), ...time }
}

export function mergeDateTime(date: CalendarDate, time: CalendarTime): CalendarDateTime {
  return { ...date, ...time }
}

/** Negative when `left` is earlier, the shape `compareDates` uses. */
export function compareDateTimes(left: CalendarDateTime, right: CalendarDateTime): number {
  return compareDates(left, right) || compareTimes(left, right)
}

export function isSameDateTime(left: CalendarDateTime, right: CalendarDateTime): boolean {
  return compareDateTimes(left, right) === 0
}

export function isWithinDateTime(value: CalendarDateTime, bounds: DateTimeBounds): boolean {
  if (bounds.min && compareDateTimes(value, bounds.min) < 0) return false
  if (bounds.max && compareDateTimes(value, bounds.max) > 0) return false
  return true
}

/**
 * The days a bound leaves open, which is a wider question than the instant.
 *
 * A minimum of 09:00 on the 24th does not put the 24th out of reach -- the
 * afternoon of it is still allowed -- so the grid is bounded by the day and
 * the clock is bounded separately. Giving the grid the whole bound would grey
 * out a day that has allowed times in it.
 */
export function dateBounds(bounds: DateTimeBounds): {
  min?: CalendarDate
  max?: CalendarDate
} {
  return {
    ...(bounds.min ? { min: dateOf(bounds.min) } : {}),
    ...(bounds.max ? { max: dateOf(bounds.max) } : {}),
  }
}

/** A window nothing fits in: `isWithinTime` refuses everything when min > max. */
const NO_TIME: TimeBounds = {
  min: { hour: 23, minute: 59, second: 59 },
  max: { hour: 0, minute: 0 },
}

/**
 * What the clock may show, given which day is chosen.
 *
 * Only on the edge days: 09:00 on the 24th is a floor on the 24th and says
 * nothing about the 25th. Both apply when a bound pair sits inside one day,
 * and on a day outside the bounds entirely the answer is the empty window
 * `isWithinTime` already produces from a minimum above its maximum -- which
 * is the honest answer, because no time on that day is allowed.
 */
export function timeBoundsOn(date: CalendarDate, bounds: DateTimeBounds): TimeBounds {
  const { min, max } = bounds
  if (min && compareDates(date, min) < 0) return NO_TIME
  if (max && compareDates(date, max) > 0) return NO_TIME
  return {
    ...(min && isSameDay(date, min) ? { min: timeOf(min) } : {}),
    ...(max && isSameDay(date, max) ? { max: timeOf(max) } : {}),
  }
}

/**
 * The UTC instant for a civil date and time, for `Intl.DateTimeFormat` and
 * nothing else. Pair it with `timeZone: 'UTC'` there; see `toTimestamp`.
 */
export function toDateTimeTimestamp(value: CalendarDateTime): number {
  return toTimestamp(value) + secondsOfDay(value) * 1000
}

/**
 * The nearest allowed value, which is the bound itself when one is crossed.
 *
 * Wanted when the *day* moves under a time that was already chosen: a
 * minimum of 09:00 on the 24th and a clock already showing 08:00 means
 * picking the 24th produces a value below the minimum, and the day is the
 * thing the person just asked for. Clamping raises the time and keeps the
 * day; refusing the press would look like a broken cell.
 */
export function clampDateTime(value: CalendarDateTime, bounds: DateTimeBounds): CalendarDateTime {
  if (bounds.min && compareDateTimes(value, bounds.min) < 0) return bounds.min
  if (bounds.max && compareDateTimes(value, bounds.max) > 0) return bounds.max
  return value
}
