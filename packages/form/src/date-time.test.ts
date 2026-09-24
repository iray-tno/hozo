import assert from 'node:assert/strict'
import { test } from 'node:test'

import { dateTimeLabel } from './date-time-format.ts'
import {
  type CalendarDateTime,
  clampDateTime,
  compareDateTimes,
  dateBounds,
  dateOf,
  isSameDateTime,
  isWithinDateTime,
  mergeDateTime,
  timeBoundsOn,
  timeOf,
  toDateTimeTimestamp,
  withDate,
  withTime,
} from './date-time-rules.ts'

const at = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second?: number,
): CalendarDateTime => ({
  year,
  month,
  day,
  hour,
  minute,
  ...(second === undefined ? {} : { second }),
})

const day = (year: number, month: number, dayOfMonth: number) => ({ year, month, day: dayOfMonth })

test('a date-time is a date and a time at once, with nothing to take apart', () => {
  const value = at(2026, 9, 24, 9, 30)
  // The point of the intersection: both halves accept the whole value, which
  // is why `Calendar` and `TimePicker` are handed it unchanged.
  assert.deepEqual(dateOf(value), day(2026, 9, 24))
  assert.deepEqual(timeOf(value), { hour: 9, minute: 30 })
  assert.deepEqual(mergeDateTime(day(2026, 9, 24), { hour: 9, minute: 30 }), value)
})

test('seconds are carried when they exist and dropped when the new time has none', () => {
  const precise = at(2026, 9, 24, 9, 30, 43)
  assert.deepEqual(timeOf(precise), { hour: 9, minute: 30, second: 43 })
  // A picker showing hours and minutes would otherwise keep an invisible 43
  // seconds through every edit.
  assert.deepEqual(withTime(precise, { hour: 10, minute: 0 }), at(2026, 9, 24, 10, 0))
  assert.deepEqual(withDate(precise, day(2026, 9, 25)), at(2026, 9, 25, 9, 30, 43))
})

test('comparison reads the date first and the clock only to break a tie', () => {
  assert.ok(compareDateTimes(at(2026, 9, 24, 23, 59), at(2026, 9, 25, 0, 0)) < 0)
  assert.ok(compareDateTimes(at(2026, 9, 24, 9, 30), at(2026, 9, 24, 9, 29)) > 0)
  assert.equal(compareDateTimes(at(2026, 9, 24, 9, 30), at(2026, 9, 24, 9, 30)), 0)
  assert.equal(isSameDateTime(at(2026, 9, 24, 9, 30), at(2026, 9, 24, 9, 30)), true)
  assert.equal(isSameDateTime(at(2026, 9, 24, 9, 30), at(2026, 9, 24, 9, 30, 0)), true)
})

test('bounds are whole values, so an hour on a day is a bound the grid cannot hold', () => {
  const bounds = { min: at(2026, 9, 24, 9, 0), max: at(2026, 9, 26, 17, 0) }
  assert.equal(isWithinDateTime(at(2026, 9, 24, 8, 59), bounds), false)
  assert.equal(isWithinDateTime(at(2026, 9, 24, 9, 0), bounds), true)
  assert.equal(isWithinDateTime(at(2026, 9, 26, 17, 1), bounds), false)
  // The grid is bounded by the day, because the afternoon of the 24th is
  // allowed and a greyed-out 24th would say otherwise.
  assert.deepEqual(dateBounds(bounds), { min: day(2026, 9, 24), max: day(2026, 9, 26) })
})

test('the clock is bounded only on the days the bounds name', () => {
  const bounds = { min: at(2026, 9, 24, 9, 0), max: at(2026, 9, 26, 17, 0) }
  assert.deepEqual(timeBoundsOn(day(2026, 9, 24), bounds), { min: { hour: 9, minute: 0 } })
  assert.deepEqual(timeBoundsOn(day(2026, 9, 26), bounds), { max: { hour: 17, minute: 0 } })
  assert.deepEqual(timeBoundsOn(day(2026, 9, 25), bounds), {}, 'the whole of the middle day')
})

test('both ends apply when the bounds sit inside one day', () => {
  const bounds = { min: at(2026, 9, 24, 9, 0), max: at(2026, 9, 24, 17, 0) }
  assert.deepEqual(timeBoundsOn(day(2026, 9, 24), bounds), {
    min: { hour: 9, minute: 0 },
    max: { hour: 17, minute: 0 },
  })
})

test('a day outside the bounds has no allowed time, and says so', () => {
  const bounds = { min: at(2026, 9, 24, 9, 0), max: at(2026, 9, 26, 17, 0) }
  // A minimum above its maximum is the window `isWithinTime` reads as empty,
  // which is the honest answer: no time on that day is allowed.
  const before = timeBoundsOn(day(2026, 9, 23), bounds)
  assert.ok(before.min && before.max)
  assert.ok(before.min.hour > before.max.hour)
  const after = timeBoundsOn(day(2026, 9, 27), bounds)
  assert.ok(after.min && after.max)
  assert.ok(after.min.hour > after.max.hour)
})

test('clamping raises the time and keeps the day the person pressed', () => {
  const bounds = { min: at(2026, 9, 24, 9, 0), max: at(2026, 9, 26, 17, 0) }
  // The case it exists for: 08:00 was already showing, and the 24th was
  // pressed. Refusing the press would look like a broken cell.
  assert.deepEqual(clampDateTime(at(2026, 9, 24, 8, 0), bounds), at(2026, 9, 24, 9, 0))
  assert.deepEqual(clampDateTime(at(2026, 9, 26, 18, 0), bounds), at(2026, 9, 26, 17, 0))
  assert.deepEqual(clampDateTime(at(2026, 9, 25, 12, 0), bounds), at(2026, 9, 25, 12, 0))
  assert.deepEqual(clampDateTime(at(2026, 9, 25, 12, 0), {}), at(2026, 9, 25, 12, 0))
})

test('the instant is UTC midnight plus the time, not a local one', () => {
  assert.equal(toDateTimeTimestamp(at(2026, 9, 24, 0, 0)), Date.UTC(2026, 8, 24))
  assert.equal(
    toDateTimeTimestamp(at(2026, 9, 24, 9, 30, 15)),
    Date.UTC(2026, 8, 24) + (9 * 3600 + 30 * 60 + 15) * 1000,
  )
})

test('the label is one formatter over both halves, not two joined by hand', () => {
  const text = dateTimeLabel(at(2026, 9, 24, 9, 30), 'en-US', { hour12: true })
  assert.match(text, /September 24, 2026/)
  assert.match(text, /9:30/)
  assert.match(text, /AM/)
  // The word between the two is the locale's own -- "at" in English, nothing
  // at all in Japanese -- which is the reason it is not a template string.
  assert.doesNotMatch(dateTimeLabel(at(2026, 9, 24, 9, 30), 'ja-JP', { hour12: false }), / at /)
})

test('the label reads the value in UTC, so the day it prints is the day it was given', () => {
  // Without `timeZone: 'UTC'` the formatter reads the instant back in the
  // viewer's zone and prints the 23rd for everyone west of Greenwich.
  assert.match(dateTimeLabel(at(2026, 9, 24, 0, 0), 'en-US', { hour12: false }), /September 24/)
  assert.match(dateTimeLabel(at(2026, 9, 24, 23, 59), 'en-US', { hour12: false }), /September 24/)
})
