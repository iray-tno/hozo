import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  addDays,
  addMonths,
  addYears,
  type CalendarDate,
  type CalendarKey,
  compareDates,
  daysInMonth,
  firstDayOfWeek,
  isLeapYear,
  isSameDay,
  isWithin,
  monthGrid,
  moveFocus,
  weekdayOf,
} from './calendar-rules.ts'

const date = (year: number, month: number, day: number): CalendarDate => ({ year, month, day })

/**
 * A date as text, so a failed assertion reads as a date rather than as a
 * diff of three numbers. `null` and `undefined` pass through as themselves
 * instead of being asserted away, which keeps the casts out of the tests
 * and lets a wrong `null` fail with a message that says so.
 */
const iso = (value: CalendarDate | null | undefined) => {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  const month = String(value.month).padStart(2, '0')
  return `${value.year}-${month}-${String(value.day).padStart(2, '0')}`
}

const grid = (year: number, month: number, first: 0 | 1 | 6, weeks?: number) =>
  monthGrid({ year, month, firstDayOfWeek: first, weeks }).map((week) =>
    week.map((cell) => `${iso(cell.date)}${cell.outside ? ' outside' : ''}`),
  )

test('the leap rule is the full one, centuries included', () => {
  assert.equal(isLeapYear(2024), true)
  assert.equal(isLeapYear(2023), false)
  assert.equal(isLeapYear(1900), false, 'divisible by 100 and not by 400')
  assert.equal(isLeapYear(2000), true, 'divisible by 400')
})

test('February is the only month that moves', () => {
  const lengths = (year: number) =>
    Array.from({ length: 12 }, (_, index) => daysInMonth(year, index + 1))
  assert.deepEqual(lengths(2026), [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31])
  assert.deepEqual(lengths(2024), [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31])
})

test('weekdays match dates whose day of the week is a matter of record', () => {
  assert.equal(weekdayOf(date(2000, 1, 1)), 6, 'the first of January 2000 was a Saturday')
  assert.equal(weekdayOf(date(2024, 1, 1)), 1, 'a Monday')
  assert.equal(weekdayOf(date(2024, 2, 29)), 4, 'the leap day of 2024 was a Thursday')
  assert.equal(weekdayOf(date(2026, 9, 24)), 4, 'a Thursday')
})

test('a year below 100 is that year, not its 1900s twin', () => {
  // `Date.UTC(50, 0, 1)` is 1950 unless the mapping is undone, and a grid
  // that silently reads the year 50 as 1950 draws the wrong month.
  assert.equal(iso(addDays(date(50, 1, 1), 0)), '50-01-01')
  assert.equal(iso(addDays(date(99, 12, 31), 1)), '100-01-01')
})

test('days carry across months and years', () => {
  assert.equal(iso(addDays(date(2026, 9, 30), 1)), '2026-10-01')
  assert.equal(iso(addDays(date(2026, 12, 31), 1)), '2027-01-01')
  assert.equal(iso(addDays(date(2027, 1, 1), -1)), '2026-12-31')
  assert.equal(iso(addDays(date(2024, 2, 28), 1)), '2024-02-29', 'a leap year has the 29th')
  assert.equal(iso(addDays(date(2026, 2, 28), 1)), '2026-03-01', 'and a common year does not')
})

test('a month step clamps the day rather than overflowing into the next month', () => {
  assert.equal(iso(addMonths(date(2026, 1, 31), 1)), '2026-02-28')
  assert.equal(iso(addMonths(date(2024, 1, 31), 1)), '2024-02-29')
  assert.equal(iso(addMonths(date(2026, 3, 31), -1)), '2026-02-28')
  assert.equal(iso(addMonths(date(2026, 1, 15), -1)), '2025-12-15', 'backwards over a year end')
  assert.equal(iso(addMonths(date(2026, 12, 15), 1)), '2027-01-15', 'and forwards over one')
  assert.equal(iso(addMonths(date(2026, 6, 10), -18)), '2024-12-10', 'more than a year at once')
})

test('a year step clamps on the leap day, which is the only day it can', () => {
  assert.equal(iso(addYears(date(2024, 2, 29), 1)), '2025-02-28')
  assert.equal(iso(addYears(date(2024, 2, 29), 4)), '2028-02-29')
})

test('dates compare and bound by calendar order', () => {
  assert.ok(compareDates(date(2026, 1, 2), date(2026, 2, 1)) < 0, 'month outranks day')
  assert.ok(compareDates(date(2025, 12, 31), date(2026, 1, 1)) < 0, 'year outranks month')
  assert.equal(compareDates(date(2026, 9, 24), date(2026, 9, 24)), 0)
  assert.equal(isSameDay(date(2026, 9, 24), date(2026, 9, 24)), true)

  const bounds = { min: date(2026, 9, 1), max: date(2026, 9, 30) }
  assert.equal(isWithin(date(2026, 9, 1), bounds), true, 'the minimum is inside')
  assert.equal(isWithin(date(2026, 9, 30), bounds), true, 'and so is the maximum')
  assert.equal(isWithin(date(2026, 8, 31), bounds), false)
  assert.equal(isWithin(date(2026, 10, 1), bounds), false)
  assert.equal(isWithin(date(1970, 1, 1), {}), true, 'no bounds admits everything')
})

test('the week starts where the region says, and on Monday when it says nothing', () => {
  assert.equal(firstDayOfWeek('ja-JP'), 0)
  assert.equal(firstDayOfWeek('en-US'), 0)
  assert.equal(firstDayOfWeek('de-DE'), 1)
  assert.equal(firstDayOfWeek('fr-FR'), 1)
  assert.equal(firstDayOfWeek('ar-EG'), 6)
  assert.equal(firstDayOfWeek('zh-Hant-TW'), 0, 'a script subtag is not read as a region')
  assert.equal(firstDayOfWeek('en_GB'), 1, 'an underscore separates subtags too')
  assert.equal(firstDayOfWeek('es-419'), 1, 'an area code outside the table takes the default')
  assert.equal(firstDayOfWeek(undefined), 1)
  assert.equal(firstDayOfWeek('ja'), 1, 'no region, so the default rather than a guess at Japan')
})

test('a month grid is six weeks of seven days, aligned to the first day of the week', () => {
  const september = grid(2026, 9, 1)
  assert.equal(september.length, 6)
  assert.ok(
    september.every((week) => week.length === 7),
    'every row is a week',
  )
  // The first of September 2026 is a Tuesday, so a Monday-first grid opens
  // on the Monday before it and closes in October.
  assert.deepEqual(september[0], [
    '2026-08-31 outside',
    '2026-09-01',
    '2026-09-02',
    '2026-09-03',
    '2026-09-04',
    '2026-09-05',
    '2026-09-06',
  ])
  assert.equal(september[5]?.[6], '2026-10-11 outside')
})

test('the same month starts a day earlier when the week starts on Sunday', () => {
  const september = grid(2026, 9, 0)
  assert.equal(september[0]?.[0], '2026-08-30 outside')
  assert.equal(september[0]?.[2], '2026-09-01')
})

test('a grid holds every day of its month exactly once, whatever the month', () => {
  for (const first of [0, 1, 6] as const) {
    for (let month = 1; month <= 12; month += 1) {
      for (const year of [2024, 2026]) {
        const inside = grid(year, month, first)
          .flat()
          .filter((cell) => !cell.endsWith('outside'))
        const expected = Array.from({ length: daysInMonth(year, month) }, (_, index) =>
          iso(date(year, month, index + 1)),
        )
        assert.deepEqual(inside, expected, `${year}-${month} starting on ${first}`)
      }
    }
  }
})

test('a shorter grid is still aligned, for a design that wants no blank row', () => {
  const september = grid(2026, 9, 1, 5)
  assert.equal(september.length, 5)
  assert.equal(september[0]?.[0], '2026-08-31 outside')
})

test('arrows move by a day and a week, leaving the month when they have to', () => {
  const from = date(2026, 9, 24)
  assert.equal(iso(moveFocus(from, 'ArrowLeft')), '2026-09-23')
  assert.equal(iso(moveFocus(from, 'ArrowRight')), '2026-09-25')
  assert.equal(iso(moveFocus(from, 'ArrowUp')), '2026-09-17')
  assert.equal(iso(moveFocus(from, 'ArrowDown')), '2026-10-01')
  // The case the doc comment names: a week down from the 29th is in October,
  // which is why this is date arithmetic and not an index into the grid.
  assert.equal(iso(moveFocus(date(2026, 9, 29), 'ArrowDown')), '2026-10-06')
})

test('right-to-left swaps the horizontal arrows and nothing else', () => {
  const from = date(2026, 9, 24)
  assert.equal(iso(moveFocus(from, 'ArrowLeft', { rtl: true })), '2026-09-25')
  assert.equal(iso(moveFocus(from, 'ArrowRight', { rtl: true })), '2026-09-23')
  assert.equal(iso(moveFocus(from, 'ArrowUp', { rtl: true })), '2026-09-17')
  assert.equal(iso(moveFocus(from, 'ArrowDown', { rtl: true })), '2026-10-01')
})

test('Home and End are the ends of the week, which moves with its first day', () => {
  const from = date(2026, 9, 24)
  assert.equal(iso(moveFocus(from, 'Home', { firstDayOfWeek: 1 })), '2026-09-21')
  assert.equal(iso(moveFocus(from, 'End', { firstDayOfWeek: 1 })), '2026-09-27')
  assert.equal(iso(moveFocus(from, 'Home', { firstDayOfWeek: 0 })), '2026-09-20')
  assert.equal(iso(moveFocus(from, 'End', { firstDayOfWeek: 0 })), '2026-09-26')
})

test('paging moves a month, with the day clamped the same way', () => {
  assert.equal(iso(moveFocus(date(2026, 9, 24), 'PageUp')), '2026-08-24')
  assert.equal(iso(moveFocus(date(2026, 9, 24), 'PageDown')), '2026-10-24')
  assert.equal(iso(moveFocus(date(2026, 3, 31), 'PageUp')), '2026-02-28')
})

test('a move past a bound is refused, and says so by not moving', () => {
  const bounds = { min: date(2026, 9, 1), max: date(2026, 9, 30) }
  assert.equal(iso(moveFocus(date(2026, 9, 30), 'ArrowRight', bounds)), '2026-09-30')
  assert.equal(iso(moveFocus(date(2026, 9, 1), 'ArrowLeft', bounds)), '2026-09-01')
  assert.equal(iso(moveFocus(date(2026, 9, 24), 'PageDown', bounds)), '2026-09-24')
  assert.equal(
    iso(moveFocus(date(2026, 9, 24), 'ArrowRight', bounds)),
    '2026-09-25',
    'a move inside the bounds still happens',
  )
})

test('a key the grid does not own is left alone, which is not the same as a refusal', () => {
  // `null` tells the component to let the event through; the date unchanged
  // tells it the key was handled and `preventDefault` is still owed.
  assert.equal(iso(moveFocus(date(2026, 9, 24), 'Enter' as CalendarKey)), 'null')
  assert.equal(iso(moveFocus(date(2026, 9, 24), 'Tab' as CalendarKey)), 'null')
  assert.equal(
    iso(moveFocus(date(2026, 9, 1), 'ArrowLeft', { min: date(2026, 9, 1) })),
    '2026-09-01',
    'a refused move is a date, not null',
  )
})
