/**
 * The date arithmetic a calendar grid needs, with no `Date` in its types.
 *
 * A month grid is made of *civil* dates -- "the 24th of September" -- and
 * `Date` is an instant on a timeline. Building one from local parts shifts
 * across DST and timezone boundaries, which is how a grid ends up drawing
 * the 1st twice or losing the last day of a month for users east of UTC.
 * So the types here are plain records and every calculation goes through
 * UTC internally, where a day is always 86400000ms.
 *
 * Movement lives here rather than in `@hozo/behaviors`' `RovingFocus` for a
 * reason that is not about layering. `nextIndex` walks a flat list bounded
 * by `count`, and a calendar's arrows leave the rendered month: pressing
 * Down on the 29th of September lands on the 6th of October, which is not
 * in the list. The domain is unbounded, so the arithmetic is date
 * arithmetic. `RovingFocus` still owns the tab-stop bookkeeping for the
 * cells that *are* rendered.
 */

/** Days are 86400000ms apart in UTC, where no offset ever changes. */
const MS_PER_DAY = 86_400_000

export interface CalendarDate {
  year: number
  /**
   * 1-12.
   *
   * `Date`'s 0-11 is a standing bug source, and `Intl.DateTimeFormat`
   * speaks 1-12 in its output, so the boundary that would need the -1 is
   * the one place it is applied.
   */
  month: number
  day: number
}

/** A month on its own, which is what a grid is asked for and shows. */
export interface CalendarMonth {
  year: number
  /** 1-12. */
  month: number
}

export interface CalendarCell {
  date: CalendarDate
  /** From the month before or after the one the grid was asked for. */
  outside: boolean
}

/** 0 is Sunday, matching `getUTCDay` and CLDR's day numbering. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export type CalendarKey =
  | 'ArrowLeft'
  | 'ArrowRight'
  | 'ArrowUp'
  | 'ArrowDown'
  | 'Home'
  | 'End'
  | 'PageUp'
  | 'PageDown'

/**
 * The UTC midnight instant for a civil date.
 *
 * Exported for the one job that genuinely needs an instant:
 * `Intl.DateTimeFormat` formats instants, not dates. Pair it with
 * `timeZone: 'UTC'` there, or the formatter reads it back in the viewer's
 * zone and prints the day before for everyone west of Greenwich.
 */
export function toTimestamp(date: CalendarDate): number {
  const ms = Date.UTC(date.year, date.month - 1, date.day)
  // `Date.UTC` maps years 0-99 onto 1900-1999. Undone rather than
  // documented as a limit, because a grid that silently moves the year 50
  // to 1950 is worse than the two lines it costs to be right.
  if (date.year >= 0 && date.year <= 99) {
    const shifted = new Date(ms)
    shifted.setUTCFullYear(date.year)
    return shifted.getTime()
  }
  return ms
}

function fromUtc(ms: number): CalendarDate {
  const date = new Date(ms)
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31
}

export function weekdayOf(date: CalendarDate): Weekday {
  return new Date(toTimestamp(date)).getUTCDay() as Weekday
}

export function addDays(date: CalendarDate, days: number): CalendarDate {
  return fromUtc(toTimestamp(date) + days * MS_PER_DAY)
}

/**
 * Whole months, with the day clamped to the shorter month.
 *
 * The 31st of January plus one month is the 28th of February, not the 3rd
 * of March. Both readings exist; this one is what a calendar's PageDown
 * has to do, because the alternative skips February entirely.
 */
export function addMonths(date: CalendarDate, months: number): CalendarDate {
  const ordinal = date.year * 12 + (date.month - 1) + months
  const year = Math.floor(ordinal / 12)
  const month = (((ordinal % 12) + 12) % 12) + 1
  return { year, month, day: Math.min(date.day, daysInMonth(year, month)) }
}

export function addYears(date: CalendarDate, years: number): CalendarDate {
  return addMonths(date, years * 12)
}

/** Negative when `left` is earlier, so it sorts and compares in one shape. */
export function compareDates(left: CalendarDate, right: CalendarDate): number {
  return left.year - right.year || left.month - right.month || left.day - right.day
}

export function isSameDay(left: CalendarDate, right: CalendarDate): boolean {
  return compareDates(left, right) === 0
}

export function isWithin(
  date: CalendarDate,
  bounds: { min?: CalendarDate; max?: CalendarDate },
): boolean {
  if (bounds.min && compareDates(date, bounds.min) < 0) return false
  if (bounds.max && compareDates(date, bounds.max) > 0) return false
  return true
}

/**
 * Two days and everything between them.
 *
 * `start` is never after `end` -- `orderRange` is how one is made, and the
 * type cannot say so, which is why nothing else in this file constructs one.
 */
export interface CalendarRange {
  start: CalendarDate
  end: CalendarDate
}

/**
 * A range from two days in either order.
 *
 * Whichever day is clicked second is as likely to be the earlier one, and a
 * range that had to be picked forwards would be a rule the user has to learn
 * rather than one the component keeps.
 */
export function orderRange(one: CalendarDate, other: CalendarDate): CalendarRange {
  return compareDates(one, other) <= 0 ? { start: one, end: other } : { start: other, end: one }
}

/** Inclusive of both ends, which is what a calendar's highlight shows. */
export function isWithinRange(date: CalendarDate, range: CalendarRange): boolean {
  return compareDates(date, range.start) >= 0 && compareDates(date, range.end) <= 0
}

/**
 * Today where the viewer is, which is the only function here that reads a
 * clock.
 *
 * Local parts rather than UTC ones, deliberately: "today" is a civil date
 * in the viewer's own zone, and a calendar that marked the UTC day would
 * highlight tomorrow all evening in Tokyo and yesterday all morning in
 * Los Angeles. Every component takes a `today` prop that overrides this,
 * so a test never has to depend on when it ran.
 */
export function todayLocal(): CalendarDate {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() }
}

/**
 * Regions whose week starts on Sunday, and those that start on Saturday.
 *
 * This is the one piece of week data `Intl` cannot supply here.
 * `Intl.Locale.prototype.getWeekInfo` is a later addition to ECMA-402 and
 * Hermes ships only `Collator`, `DateTimeFormat` and `NumberFormat` --
 * the same wall `@hozo/canvas` hit with `Intl.Segmenter`. So the answer is
 * a table, deterministic and identical on both platforms, rather than a
 * lookup that works on the Web and guesses on a phone.
 *
 * A practical subset of CLDR's `weekData/firstDay`, not a mirror of it:
 * every region absent from both sets starts on Monday, which is CLDR's
 * own default. `firstDayOfWeek` is a prop on the component for the cases
 * this gets wrong.
 */
const SUNDAY_FIRST: ReadonlySet<string> = new Set(
  // Written as text rather than as an array of 57 quoted strings, which the
  // formatter would put one to a line.
  `AG AS AU BD BR BS BT BW BZ CA CN CO DM DO ET GT GU HK HN ID IL IN JM JP KE KH KR LA MH
   MM MO MT MX MZ NI NP PA PE PH PK PR PT PY SA SG SV TH TT TW UM US VE VI WS YE ZA ZW`.split(
    /\s+/,
  ),
)

const SATURDAY_FIRST: ReadonlySet<string> = new Set(
  'AE AF BH DJ DZ EG IQ IR JO KW LY OM QA SD SY'.split(' '),
)

/**
 * The region subtag, skipping the language so a two-letter language is not
 * read as a region. Script subtags are four letters and UN M.49 areas are
 * three digits, so neither is mistaken for one.
 */
function regionOf(locale: string | undefined): string | undefined {
  if (!locale) return undefined
  const [, ...rest] = locale.split(/[-_]/)
  for (const part of rest) {
    if (/^[A-Za-z]{2}$/.test(part)) return part.toUpperCase()
    if (/^\d{3}$/.test(part)) return part
  }
  return undefined
}

export function firstDayOfWeek(locale?: string): Weekday {
  const region = regionOf(locale)
  if (region === undefined) return 1
  if (SUNDAY_FIRST.has(region)) return 0
  if (SATURDAY_FIRST.has(region)) return 6
  return 1
}

/** How far into its week a date sits, once the week's first day is known. */
function offsetInWeek(date: CalendarDate, first: Weekday): number {
  return (weekdayOf(date) - first + 7) % 7
}

export interface MonthGridOptions {
  year: number
  /** 1-12. */
  month: number
  firstDayOfWeek?: Weekday
  /**
   * Six by default, so the grid keeps one height.
   *
   * Between four and six weeks are needed depending on the month, and a
   * grid that resizes as the user pages through months moves everything
   * below it. Six is always enough: the longest month is 31 days and the
   * largest leading offset is 6.
   */
  weeks?: number
}

export function monthGrid(options: MonthGridOptions): CalendarCell[][] {
  const { year, month, firstDayOfWeek: first = 1, weeks = 6 } = options
  const start = addDays({ year, month, day: 1 }, -offsetInWeek({ year, month, day: 1 }, first))
  return Array.from({ length: weeks }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => {
      const date = addDays(start, week * 7 + day)
      return { date, outside: date.month !== month || date.year !== year }
    }),
  )
}

export interface CalendarMoveOptions {
  min?: CalendarDate
  max?: CalendarDate
  firstDayOfWeek?: Weekday
  rtl?: boolean
}

function step(
  from: CalendarDate,
  key: CalendarKey,
  first: Weekday,
  rtl: boolean,
): CalendarDate | null {
  switch (key) {
    case 'ArrowLeft':
      return addDays(from, rtl ? 1 : -1)
    case 'ArrowRight':
      return addDays(from, rtl ? -1 : 1)
    case 'ArrowUp':
      return addDays(from, -7)
    case 'ArrowDown':
      return addDays(from, 7)
    case 'Home':
      return addDays(from, -offsetInWeek(from, first))
    case 'End':
      return addDays(from, 6 - offsetInWeek(from, first))
    case 'PageUp':
      return addMonths(from, -1)
    case 'PageDown':
      return addMonths(from, 1)
    default:
      return null
  }
}

/**
 * Where a key press puts the focused day, or `null` when the key is not
 * one of ours.
 *
 * The two answers are deliberately different. `null` means the component
 * should leave the event alone -- something else may want the key. The
 * date unchanged means the key *was* handled and the move was refused,
 * which still has to call `preventDefault` or the browser scrolls the
 * page on a blocked ArrowDown. This mirrors `nextIndex`, which returns
 * `null` for a key it does not know and the current index for a move it
 * will not make.
 *
 * `PageUp` and `PageDown` move by a month. A year is the component's to
 * ask for with `addYears`, because the modifier that means "year" is a
 * platform convention rather than a property of the grid.
 */
export function moveFocus(
  from: CalendarDate,
  key: CalendarKey,
  options: CalendarMoveOptions = {},
): CalendarDate | null {
  const { firstDayOfWeek: first = 1, rtl = false, ...bounds } = options
  const target = step(from, key, first, rtl)
  if (target === null) return null
  return isWithin(target, bounds) ? target : from
}
