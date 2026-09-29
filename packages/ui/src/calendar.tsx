/**
 * A month grid with a look, wearing `@hozo/form`.
 *
 * The behaviour is theirs and it is the largest verification matrix in the
 * repository: the ARIA grid pattern with the `<td>` itself focusable, arrows
 * across and down, PageUp and PageDown by month, Home and End on the week, the
 * bounds, the range held internally so `onChange` never fires with half a
 * range, and `Intl` for every name. This file sizes the cells and colours the
 * selection.
 *
 * ## Two traps, and they are why #638 §6 lists target size
 *
 * A month button holding `‹` is about four pixels wide under Preflight, and a
 * `<td>` holding `1` is about sixteen. Both are under WCAG 2.5.8's 24 by 24,
 * both are what an application gets if it styles a calendar quickly, and
 * `@hozo/form`'s README says so about the first because it could only warn.
 * Here they are 36 square, in a class list nobody has to remember.
 *
 * ## `aria-selected` means two different things, so there are two lists
 *
 * In range mode `@hozo/form` sets it on every day between the ends -- it is
 * the only attribute ARIA has for that. So the range list ignores it and draws
 * from `data-hozo-range-start`, `-end` and `-in-range` instead, which say
 * *which part* a day is. See `calendar-look.ts`, which holds both lists and
 * the reasoning.
 *
 * Those three attributes carried no CSS at all until #679.
 */

import { Calendar as CalendarPattern, type CalendarProps } from '@hozo/form'

import { CALENDAR, TODAY } from './calendar-look.ts'

/**
 * Distributed over the union, so `range: true` keeps the value type that goes
 * with it -- the arrangement `Accordion` and `Listbox` document.
 */
type Styled<P> = P extends unknown
  ? Omit<P, 'dayClassName' | 'headerClassName' | 'monthButtonClassName' | 'gridClassName'>
  : never

export type HozoCalendarProps = Styled<CalendarProps>
export type { CalendarDay as HozoCalendarDay } from '@hozo/form'

/**
 * The day's number, with today underlined.
 *
 * `renderDay` rather than a variant, because today is `aria-current="date"` and
 * that is not a boolean state Hozo compiles -- `calendar-look.ts` has the
 * detail. The component hands us `today`, which is the same fact the attribute
 * carries, so nothing here is a second source of truth.
 *
 * A caller who passes their own `renderDay` replaces the underline with it,
 * which is the bargain `Tree` makes for the same reason.
 */
const day = ({ date, today }: { date: { day: number }; today: boolean }) =>
  today ? <span className={TODAY}>{date.day}</span> : date.day

export function HozoCalendar({ className, renderDay, ...rest }: HozoCalendarProps) {
  return (
    <CalendarPattern
      // The cast is what the distributed type costs: JSX resolves a spread of a
      // union poorly, and the discriminant is intact where the caller writes it.
      {...(rest as CalendarProps)}
      className={className ? `${CALENDAR.group} ${className}` : CALENDAR.group}
      headerClassName={CALENDAR.header}
      monthButtonClassName={CALENDAR.monthButton}
      gridClassName={CALENDAR.grid}
      dayClassName={rest.range === true ? CALENDAR.day.range : CALENDAR.day.single}
      renderDay={renderDay ?? day}
    />
  )
}

export { HozoCalendar as Calendar, type HozoCalendarProps as CalendarProps }
