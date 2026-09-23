/**
 * The names a calendar shows, from `Intl.DateTimeFormat`.
 *
 * Shared by both halves rather than written twice, because there is nothing
 * platform-specific in it: `DateTimeFormat` is one of the three constructors
 * Hermes ships (`Collator` and `NumberFormat` are the others), so the same
 * call returns the same text on a phone as in a browser. Only the *week
 * data* had to become a table -- see `firstDayOfWeek` in `calendar-rules.ts`.
 *
 * Every formatter here passes `timeZone: 'UTC'`. `DateTimeFormat` formats an
 * instant, `toTimestamp` produces UTC midnight, and without the option the
 * formatter converts that instant into the viewer's own zone -- printing the
 * day before for everyone west of Greenwich. The bug would be invisible in
 * CI, which runs in UTC, and wrong for about half the world.
 *
 * No message dictionary lives here. The chrome an application can translate
 * -- "Previous month" and its siblings -- is a prop with an English default,
 * because #157 leaves string extraction to `i18next` and its peers rather
 * than reinventing it.
 */

import {
  type CalendarDate,
  type CalendarMonth,
  toTimestamp,
  type Weekday,
} from './calendar-rules.ts'

/**
 * A Sunday, used to name the days of the week.
 *
 * The 2nd of January 2000: the 1st was a Saturday, which makes the 2nd the
 * Sunday that `getUTCDay` numbers 0. Any week would do -- weekday names do
 * not depend on which week they are read from -- and a fixed one keeps the
 * labels independent of the clock.
 */
const SUNDAY = Date.UTC(2000, 0, 2)

const DAY_MS = 86_400_000

export interface WeekdayLabel {
  /** For the column header, where space is one or two characters. */
  short: string
  /** For `abbr` and for the header's accessible name. */
  long: string
  /** For the narrowest headers, where `short` still does not fit. */
  narrow: string
}

function formatter(locale: string | undefined, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' })
}

/** "September 2026", in the locale's own order and script. */
export function monthLabel(month: CalendarMonth, locale?: string): string {
  const at = toTimestamp({ year: month.year, month: month.month, day: 1 })
  return formatter(locale, { year: 'numeric', month: 'long' }).format(at)
}

/** The seven day names, starting with the day the week starts on. */
export function weekdayLabels(first: Weekday, locale?: string): WeekdayLabel[] {
  const short = formatter(locale, { weekday: 'short' })
  const long = formatter(locale, { weekday: 'long' })
  const narrow = formatter(locale, { weekday: 'narrow' })
  return Array.from({ length: 7 }, (_, index) => {
    const at = SUNDAY + ((first + index) % 7) * DAY_MS
    return { short: short.format(at), long: long.format(at), narrow: narrow.format(at) }
  })
}

/**
 * The whole date, spoken: "Thursday, September 24, 2026".
 *
 * A cell's accessible name rather than its text. The weekday is in it on
 * purpose -- a screen reader user arriving at a cell by arrow key has no
 * column header to read it from -- which is also why the rendered header
 * row is hidden from the accessibility tree.
 */
export function dayLabel(date: CalendarDate, locale?: string): string {
  return formatter(locale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(toTimestamp(date))
}

/**
 * Just the number, in the locale's digits.
 *
 * `Intl` rather than `String(date.day)` so that a locale using
 * Arabic-Indic or Devanagari digits gets them, the way the month label
 * beside it already does.
 */
export function dayNumber(date: CalendarDate, locale?: string): string {
  return formatter(locale, { day: 'numeric' }).format(toTimestamp(date))
}
