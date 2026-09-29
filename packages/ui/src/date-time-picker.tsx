/**
 * A day and a time in one dialog, with a look, wearing `@hozo/form`.
 *
 * The behaviour is theirs, and the interesting part is when it closes: picking
 * a day cannot dismiss a picker whose time is not set, so the dialog stays open
 * behind an explicit Done that confirms nothing and only closes. Escape and a
 * press outside still dismiss it, and every change has been reported by then.
 *
 * ## The clock comes in through `children`, which is the seam for it
 *
 * `@hozo/form` forwards no class names to its time half -- it renders a bare
 * `TimePicker` when `children` is left out, and there is no `timeFieldClassName`
 * to reach it with. That is deliberate: #148 records that the time half is the
 * caller's choice, because a spinbutton expresses a continuum and a list
 * expresses a set with holes in it, so the prop is a render function rather than
 * a bag of class names for one of the two.
 *
 * So this passes the styled `TimePicker` through that seam. A caller who wants
 * a `Listbox` of quarter-hours passes their own `children` and this gets out of
 * the way, which is the arrangement the prop exists for.
 *
 * Everything else is `calendar-look.ts`, shared with the three other grids.
 */

import { DateTimePicker as DateTimePickerPattern, type DateTimePickerProps } from '@hozo/form'

import { CALENDAR, TODAY } from './calendar-look.ts'
import { HozoTimePicker } from './time-picker.tsx'

export type HozoDateTimePickerProps = Omit<
  DateTimePickerProps,
  | 'triggerClassName'
  | 'dialogClassName'
  | 'calendarClassName'
  | 'headerClassName'
  | 'monthButtonClassName'
  | 'gridClassName'
  | 'dayClassName'
  | 'doneClassName'
>

const day = ({ date, today }: { date: { day: number }; today: boolean }) =>
  today ? <span className={TODAY}>{date.day}</span> : date.day

/**
 * Done, which closes and confirms nothing.
 *
 * The accent tone, because it is the only way out of the dialog by pointer and
 * a quiet button would read as optional. There is no Cancel beside it, which is
 * `@hozo/form`'s decision and the right one: every change has already been
 * reported, so a Cancel would imply an undo that does not exist.
 */
/**
 * The panel, written out rather than `${CALENDAR.panel} flex flex-col gap-4`.
 *
 * Joining two lists would work -- every class name still appears literally
 * somewhere in the project, which is what the candidate scan needs -- but the
 * package's rule is a complete literal per list, and a reader should be able to
 * see what an element gets without opening another file. This one holds a grid,
 * a clock and a button in a column; the other three panels hold only a grid.
 */
const panel =
  'flex flex-col gap-4 rounded-hozo-panel border border-hozo-border bg-hozo-surface p-2 shadow-hozo-surface text-hozo-text'

const done =
  'inline-flex w-full items-center justify-center gap-2 px-4 py-3 text-sm font-semibold rounded-hozo-control transition-colors cursor-pointer bg-hozo-accent text-hozo-on-accent hover:bg-hozo-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus'

export function HozoDateTimePicker({
  className,
  renderDay,
  children,
  ...rest
}: HozoDateTimePickerProps) {
  return (
    <DateTimePickerPattern
      {...rest}
      className={className}
      triggerClassName={CALENDAR.trigger}
      dialogClassName={panel}
      calendarClassName={CALENDAR.group}
      headerClassName={CALENDAR.header}
      monthButtonClassName={CALENDAR.monthButton}
      gridClassName={CALENDAR.grid}
      dayClassName={CALENDAR.day.single}
      doneClassName={done}
      renderDay={renderDay ?? day}
    >
      {children ?? ((half) => <HozoTimePicker {...half} />)}
    </DateTimePickerPattern>
  )
}

export { HozoDateTimePicker as DateTimePicker, type HozoDateTimePickerProps as DateTimePickerProps }
