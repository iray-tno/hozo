/**
 * The Native entry point.
 *
 * The arithmetic and the `Intl` formatting are shared verbatim -- a civil
 * date and a month name are the same on both platforms -- and only the
 * component differs. `calendar.native.tsx` is reached by touch rather than
 * by arrow keys, which is why the two halves are separate files rather than
 * one file with a platform branch inside it.
 */
export {
  dayLabel,
  dayNumber,
  monthLabel,
  type WeekdayLabel,
  weekdayLabels,
} from './calendar-format.ts'
export {
  addDays,
  addMonths,
  addYears,
  type CalendarCell,
  type CalendarDate,
  type CalendarKey,
  type CalendarMonth,
  type CalendarMoveOptions,
  compareDates,
  daysInMonth,
  firstDayOfWeek,
  isLeapYear,
  isSameDay,
  isWithin,
  type MonthGridOptions,
  monthGrid,
  moveFocus,
  toTimestamp,
  todayLocal,
  type Weekday,
  weekdayOf,
} from './calendar-rules.ts'
export {
  HozoCalendar as Calendar,
  HozoCalendar,
  type HozoCalendarDay as CalendarDay,
  type HozoCalendarDay,
  type HozoCalendarProps as CalendarProps,
  type HozoCalendarProps,
} from './calendar.native.tsx'
