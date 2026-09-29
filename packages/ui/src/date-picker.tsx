/**
 * A date picker with a look, wearing `@hozo/form`.
 *
 * The behaviour is theirs: the trigger's `aria-haspopup`, the dialog with its
 * focus scope and dismissal, the floating positioner, the grid inside, and the
 * value read back on the button in the same long form the cells use -- which is
 * the button's accessible name, so it is a decision about what gets spoken and
 * not only about what gets shown.
 *
 * This file is the trigger, the panel, and the same grid lists `Calendar` uses,
 * from `calendar-look.ts`. Sharing them is the point: a picker whose grid was
 * styled separately from the standalone one is two calendars to keep in step,
 * and the day people notice is the day they stop matching.
 *
 * The range twin is `date-range-picker.tsx`, and it differs by exactly one
 * class list -- `aria-selected` means "in the range" there, so the ends have to
 * come from the data attributes. That difference is in `calendar-look.ts` too,
 * beside the reason.
 */

import { DatePicker as DatePickerPattern, type DatePickerProps } from '@hozo/form'

import { CALENDAR, TODAY } from './calendar-look.ts'

export type HozoDatePickerProps = Omit<
  DatePickerProps,
  | 'triggerClassName'
  | 'dialogClassName'
  | 'calendarClassName'
  | 'headerClassName'
  | 'monthButtonClassName'
  | 'gridClassName'
  | 'dayClassName'
>

const day = ({ date, today }: { date: { day: number }; today: boolean }) =>
  today ? <span className={TODAY}>{date.day}</span> : date.day

export function HozoDatePicker({ className, renderDay, ...rest }: HozoDatePickerProps) {
  return (
    <DatePickerPattern
      {...rest}
      className={className}
      triggerClassName={CALENDAR.trigger}
      dialogClassName={CALENDAR.panel}
      calendarClassName={CALENDAR.group}
      headerClassName={CALENDAR.header}
      monthButtonClassName={CALENDAR.monthButton}
      gridClassName={CALENDAR.grid}
      dayClassName={CALENDAR.day.single}
      renderDay={renderDay ?? day}
    />
  )
}

export { HozoDatePicker as DatePicker, type HozoDatePickerProps as DatePickerProps }
