/**
 * The text a time control shows and says, from `Intl`.
 *
 * Shared by both halves for the reason `calendar-format.ts` gives: there is
 * nothing platform-specific in it, because `DateTimeFormat` and
 * `NumberFormat` are two of the three constructors Hermes ships.
 *
 * `timeZone: 'UTC'` on every formatter, and a fixed reference day under it.
 * A time of day is not an instant, so one has to be invented to hand to
 * `DateTimeFormat` -- and if the formatter is then allowed to read it back in
 * the viewer's own zone, half past nine becomes half past one somewhere.
 *
 * The individual fields go through `NumberFormat` rather than
 * `DateTimeFormat`. An hour on its own formatted as a time carries the period
 * with it in a twelve-hour locale ("1 PM" where "1" was wanted), and the
 * digits are the only thing a spinbutton's own text needs.
 */

import { type CalendarTime, secondsOfDay, timesBetween, twelveHour } from './time-rules.ts'

/**
 * A day to hang the time on. Any day would do; a fixed one keeps the output
 * independent of the clock, and the 1st of January 2001 was a Monday with
 * nothing else to recommend it.
 */
const REFERENCE_DAY = Date.UTC(2001, 0, 1)

const at = (time: CalendarTime) => REFERENCE_DAY + secondsOfDay(time) * 1000

export interface TimeTextOptions {
  /**
   * Overrides what the locale implies.
   *
   * Left out, `usesTwelveHour` decides -- which is a question `Intl` can
   * answer and Hermes may not; see the note there.
   */
  hour12?: boolean
}

/**
 * Whether this locale writes the time on a twelve-hour clock.
 *
 * Asked of `Intl` and answered with `false` when it will not say. The method
 * is `resolvedOptions`, which nothing in this repository has used before, so
 * whether Hermes implements it is genuinely unknown -- `@hozo/canvas` only
 * established that the three constructors exist, not which of their methods
 * do.
 *
 * Degrading to a twenty-four hour clock rather than to a table: a per-locale
 * table of hour cycles is CLDR's `timeData`, which is large, is keyed
 * differently from the week data in `calendar-rules.ts`, and would be a guess
 * dressed as data if it were a subset. A caller who knows better passes
 * `hour12`.
 *
 * Worth measuring on a device rather than leaving as a question: the
 * announcement a phone makes says which branch it took.
 */
export function usesTwelveHour(locale?: string): boolean {
  try {
    const resolved = new Intl.DateTimeFormat(locale, {
      hour: 'numeric',
      timeZone: 'UTC',
    }).resolvedOptions()
    if (typeof resolved.hour12 === 'boolean') return resolved.hour12
  } catch {
    // Falls through to the documented default.
  }
  return false
}

/** The whole time, spoken: "9:30 AM", or "09:30" where the locale says so. */
export function timeLabel(time: CalendarTime, locale?: string, options?: TimeTextOptions): string {
  const hour12 = options?.hour12 ?? usesTwelveHour(locale)
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    hour12,
    timeZone: 'UTC',
  }).format(at(time))
}

/** The hour alone, in the locale's digits, on whichever clock is in use. */
export function hourLabel(time: CalendarTime, locale?: string, options?: TimeTextOptions): string {
  const hour12 = options?.hour12 ?? usesTwelveHour(locale)
  const hour = hour12 ? twelveHour(time).hour : time.hour
  return new Intl.NumberFormat(locale, { useGrouping: false }).format(hour)
}

/** The minute alone, two digits, in the locale's digits. */
export function minuteLabel(time: CalendarTime, locale?: string): string {
  return new Intl.NumberFormat(locale, {
    minimumIntegerDigits: 2,
    useGrouping: false,
  }).format(time.minute)
}

export interface TimeOptionsInput {
  from: CalendarTime
  to: CalendarTime
  /** Minutes between one option and the next. */
  step: number
  locale?: string
  hour12?: boolean
  /** Which of them cannot be chosen -- a taken slot, most of the time. */
  disabled?: (time: CalendarTime) => boolean
}

/**
 * Times as options for a `Listbox`, rather than as a component.
 *
 * The other half of what #148 records: a spinbutton expresses a continuum and
 * cannot disable 09:37 on its own, while a list expresses a set the caller
 * owns and can. Those are different capabilities, so they are different
 * things, and what makes them interchangeable is `CalendarTime` rather than a
 * shared component.
 *
 * A builder and not a wrapper. `@hozo/patterns`' `Listbox` already exists on
 * both platforms with its own tests; wrapping it would add a second Native
 * half to maintain and no new behaviour.
 *
 * The shape is `HozoListboxOption`'s without importing it. `@hozo/form` has
 * no reason to depend on `@hozo/patterns` for a type, and structural typing
 * means the result goes straight into a `Listbox` anyway.
 */
export function timeOptions(
  input: TimeOptionsInput,
): { value: CalendarTime; label: string; disabled?: boolean }[] {
  const { from, to, step, locale, hour12, disabled } = input
  return timesBetween(from, to, step).map((time) => ({
    value: time,
    label: timeLabel(time, locale, { hour12 }),
    ...(disabled?.(time) ? { disabled: true } : {}),
  }))
}
