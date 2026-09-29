/**
 * A date range picker with a look, wearing `@hozo/form`.
 *
 * Its single-date twin is `date-picker.tsx`, and the only difference is the day
 * cell's class list. That is not a style preference: in range mode
 * `@hozo/form` puts `aria-selected` on **every** day between the ends, because
 * it is the only attribute ARIA gives for "in the range" -- the ends say which
 * they are in their accessible names instead. A list that filled
 * `aria-selected` would paint the range as one solid block with no ends.
 *
 * So this one draws from `data-hozo-range-start`, `-end` and `-in-range`, which
 * say which part of the range a day is. All three carried no CSS whatsoever
 * until #679: the candidate scanner cut a class name at its `=`, so every
 * valued data attribute in the project was invisible to the stylesheet.
 *
 * Everything else comes from `calendar-look.ts`, shared with the other three
 * grids.
 */

import { DateRangePicker as DateRangePickerPattern, type DateRangePickerProps } from '@hozo/form'

import { CALENDAR, TODAY } from './calendar-look.ts'

export type HozoDateRangePickerProps = Omit<
  DateRangePickerProps,
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

export function HozoDateRangePicker({ className, renderDay, ...rest }: HozoDateRangePickerProps) {
  return (
    <DateRangePickerPattern
      {...rest}
      className={className}
      triggerClassName={CALENDAR.trigger}
      dialogClassName={CALENDAR.panel}
      calendarClassName={CALENDAR.group}
      headerClassName={CALENDAR.header}
      monthButtonClassName={CALENDAR.monthButton}
      gridClassName={CALENDAR.grid}
      dayClassName={CALENDAR.day.range}
      renderDay={renderDay ?? day}
    />
  )
}

export {
  HozoDateRangePicker as DateRangePicker,
  type HozoDateRangePickerProps as DateRangePickerProps,
}
