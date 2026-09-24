import assert from 'node:assert/strict'
import { test } from 'node:test'

import { hourLabel, minuteLabel, timeLabel, timeOptions, usesTwelveHour } from './time-format.ts'
import {
  addHours,
  addMinutes,
  addSeconds,
  type CalendarTime,
  compareTimes,
  fromSecondsOfDay,
  isOnStep,
  isSameTime,
  isWithinTime,
  SECONDS_IN_DAY,
  secondsOfDay,
  timesBetween,
  twelveHour,
  withPeriod,
} from './time-rules.ts'

const time = (hour: number, minute: number, second?: number): CalendarTime =>
  second === undefined ? { hour, minute } : { hour, minute, second }

const hhmm = (value: CalendarTime) =>
  `${String(value.hour).padStart(2, '0')}:${String(value.minute).padStart(2, '0')}:${String(
    value.second ?? 0,
  ).padStart(2, '0')}`

test('a time is its seconds since midnight, and comes back from them', () => {
  assert.equal(secondsOfDay(time(0, 0)), 0)
  assert.equal(secondsOfDay(time(9, 30)), 34200)
  assert.equal(secondsOfDay(time(23, 59, 59)), SECONDS_IN_DAY - 1)
  assert.equal(hhmm(fromSecondsOfDay(34200)), '09:30:00')
  assert.equal(hhmm(fromSecondsOfDay(SECONDS_IN_DAY - 1)), '23:59:59')
})

test('a missing second is zero, so the two spellings compare the same', () => {
  assert.equal(secondsOfDay(time(9, 30)), secondsOfDay(time(9, 30, 0)))
  assert.equal(isSameTime(time(9, 30), time(9, 30, 0)), true)
})

test('the clock wraps at midnight, in both directions', () => {
  assert.equal(hhmm(addMinutes(time(23, 59), 1)), '00:00:00')
  assert.equal(hhmm(addMinutes(time(0, 0), -1)), '23:59:00')
  assert.equal(hhmm(addSeconds(time(0, 0), -1)), '23:59:59')
  assert.equal(hhmm(addHours(time(23, 30), 1)), '00:30:00', 'and keeps the minutes doing it')
  // A whole day of minutes is no movement at all.
  assert.equal(hhmm(addMinutes(time(12, 0), SECONDS_IN_DAY / 60)), '12:00:00')
})

test('an hour step keeps the minutes, which is the point of having two', () => {
  assert.equal(hhmm(addHours(time(9, 45), 1)), '10:45:00')
  assert.equal(hhmm(addHours(time(9, 45), -1)), '08:45:00')
  assert.equal(hhmm(addMinutes(time(9, 45), 15)), '10:00:00', 'and a minute step may carry')
})

test('times compare and bound by the clock', () => {
  assert.ok(compareTimes(time(9, 30), time(9, 31)) < 0)
  assert.ok(compareTimes(time(10, 0), time(9, 59)) > 0)
  assert.equal(compareTimes(time(9, 30), time(9, 30)), 0)

  const bounds = { min: time(9, 0), max: time(17, 0) }
  assert.equal(isWithinTime(time(9, 0), bounds), true, 'the minimum is inside')
  assert.equal(isWithinTime(time(17, 0), bounds), true, 'and so is the maximum')
  assert.equal(isWithinTime(time(8, 59), bounds), false)
  assert.equal(isWithinTime(time(17, 1), bounds), false)
  assert.equal(isWithinTime(time(3, 0), {}), true, 'no bounds admits everything')
})

test('a minimum above a maximum is an empty range, not one that crosses midnight', () => {
  // A clock is cyclic; an interval on it is not. Supporting 22:00 to 02:00
  // would mean every comparison asking which kind of interval it had.
  const overnight = { min: time(22, 0), max: time(2, 0) }
  assert.equal(isWithinTime(time(23, 0), overnight), false)
  assert.equal(isWithinTime(time(1, 0), overnight), false)
  assert.deepEqual(timesBetween(time(22, 0), time(2, 0), 30), [])
})

test('a step is measured from midnight', () => {
  assert.equal(isOnStep(time(9, 30), 15), true)
  assert.equal(isOnStep(time(9, 7), 15), false)
  assert.equal(isOnStep(time(9, 20), 20), true)
  assert.equal(isOnStep(time(9, 30, 30), 15), false, 'seconds count too')
  assert.equal(isOnStep(time(9, 7), 0), true, 'no step means nothing is off it')
})

test('the times between two times, inclusive, and never forever', () => {
  const morning = timesBetween(time(9, 0), time(10, 0), 15).map(hhmm)
  assert.deepEqual(morning, ['09:00:00', '09:15:00', '09:30:00', '09:45:00', '10:00:00'])
  const uneven = timesBetween(time(9, 0), time(9, 50), 20).map(hhmm)
  assert.deepEqual(uneven, ['09:00:00', '09:20:00', '09:40:00'], 'the end is not reached exactly')
  assert.deepEqual(timesBetween(time(9, 0), time(9, 0), 15).map(hhmm), ['09:00:00'])
  assert.deepEqual(timesBetween(time(9, 0), time(10, 0), 0), [], 'a step of zero would not end')
  assert.deepEqual(timesBetween(time(9, 0), time(10, 0), -5), [])
})

test('midnight is twelve am and noon is twelve pm, which is the part people get wrong', () => {
  assert.deepEqual(twelveHour(time(0, 0)), { hour: 12, period: 'am' })
  assert.deepEqual(twelveHour(time(11, 59)), { hour: 11, period: 'am' })
  assert.deepEqual(twelveHour(time(12, 0)), { hour: 12, period: 'pm' })
  assert.deepEqual(twelveHour(time(13, 0)), { hour: 1, period: 'pm' })
  assert.deepEqual(twelveHour(time(23, 0)), { hour: 11, period: 'pm' })
})

test('changing the period moves twelve hours, or nothing', () => {
  assert.equal(hhmm(withPeriod(time(9, 30), 'pm')), '21:30:00')
  assert.equal(hhmm(withPeriod(time(21, 30), 'am')), '09:30:00')
  assert.equal(hhmm(withPeriod(time(9, 30), 'am')), '09:30:00', 'already there')
  assert.equal(hhmm(withPeriod(time(0, 0), 'pm')), '12:00:00')
  assert.equal(hhmm(withPeriod(time(12, 0), 'am')), '00:00:00')
})

test('the whole time reads as the locale writes it', () => {
  // Not compared exactly. ICU 72 put a narrow no-break space before the
  // period in `en-US`, so an exact string here would have broken on a
  // toolchain upgrade rather than on a change to this file.
  const american = timeLabel(time(9, 30), 'en-US', { hour12: true })
  assert.match(american, /\b9:30\b/)
  assert.match(american, /AM/i)
  // "9:30" rather than "09:30", which is what I had written here and wrong.
  // `hour: 'numeric'` produces no leading zero, and `'2-digit'` would impose
  // one everywhere -- Japanese writes 9:30 on a twenty-four hour clock too,
  // so a leading zero is a convention rather than a rule. Letting the locale
  // decide is `timeStyle: 'short'`, which carries the same unknown as
  // `resolvedOptions`: an ECMA-402 addition whose presence on Hermes nothing
  // here has established. Deferred with that one rather than guessed at.
  const german = timeLabel(time(9, 30), 'de-DE', { hour12: false })
  assert.match(german, /\b9:30\b/)
  assert.doesNotMatch(german, /AM|PM/i)
  const evening = timeLabel(time(21, 30), 'en-US', { hour12: true })
  assert.match(evening, /\b9:30\b/)
  assert.match(evening, /PM/i)
})

test('the fields are digits alone, so a spinbutton can say one of them', () => {
  assert.equal(hourLabel(time(13, 0), 'en-US', { hour12: false }), '13')
  assert.equal(hourLabel(time(13, 0), 'en-US', { hour12: true }), '1')
  assert.equal(hourLabel(time(0, 0), 'en-US', { hour12: true }), '12')
  assert.equal(hourLabel(time(9, 0), 'en-US', { hour12: false }), '9')
  assert.equal(minuteLabel(time(9, 5), 'en-US'), '05')
  assert.equal(minuteLabel(time(9, 0), 'en-US'), '00')
  assert.equal(minuteLabel(time(9, 30), 'en-US'), '30')
  assert.doesNotMatch(hourLabel(time(13, 0), 'en-US', { hour12: true }), /PM/i, 'no period here')
})

test('the locale is asked which clock it uses, on a runtime that can answer', () => {
  // Node can. Whether Hermes can is unknown -- `resolvedOptions` is not used
  // anywhere else in this repository -- and `usesTwelveHour` returns false
  // when it cannot. So this says the question is asked correctly, and says
  // nothing about what a phone will answer.
  assert.equal(usesTwelveHour('en-US'), true)
  assert.equal(usesTwelveHour('de-DE'), false)
  assert.equal(usesTwelveHour('ja-JP'), false)
})

test('times become options a Listbox can take, with the taken ones marked', () => {
  const options = timeOptions({
    from: time(9, 0),
    to: time(10, 0),
    step: 30,
    locale: 'en-US',
    hour12: false,
    disabled: (at) => at.hour === 9 && at.minute === 30,
  })
  assert.equal(options.length, 3)
  assert.deepEqual(
    options.map((option) => hhmm(option.value)),
    ['09:00:00', '09:30:00', '10:00:00'],
  )
  assert.match(options[0]?.label ?? '', /9:00/)
  assert.equal(options[0]?.disabled, undefined, 'absent rather than false, so it is not set')
  assert.equal(options[1]?.disabled, true)
  assert.equal(options[2]?.disabled, undefined)
})
