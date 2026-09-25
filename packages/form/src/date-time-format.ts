/**
 * The text a date-and-time control shows and says.
 *
 * One formatter over both halves rather than `dayLabel` and `timeLabel`
 * concatenated. The word between a date and a time is a locale's own -- "at"
 * in English, nothing at all in Japanese -- and joining with a comma would
 * put a translator's job in a template string. `Intl.DateTimeFormat` accepts
 * date and time components in the same options bag and writes the join
 * itself.
 *
 * The component options are used rather than `dateStyle` and `timeStyle`.
 * Those two are a later addition to ECMA-402 and whether Hermes implements
 * them is the same open question as `resolvedOptions`; `weekday`, `year`,
 * `hour` and the rest have been there since the beginning.
 */

import { type CalendarDateTime, toDateTimeTimestamp } from './date-time-rules.ts'
import { type TimeTextOptions, usesTwelveHour } from './time-format.ts'

/**
 * The whole value, spoken: "Thursday, September 24, 2026 at 9:30 AM".
 *
 * The long form, matching `dayLabel`, because this is the trigger button's
 * accessible name as well as its text. An application that wants
 * "2026-09-24 09:30" passes `formatValue`; a short date is a design decision
 * and a spoken name is not.
 */
export function dateTimeLabel(
  value: CalendarDateTime,
  locale?: string,
  options?: TimeTextOptions,
): string {
  const hour12 = options?.hour12 ?? usesTwelveHour(locale)
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12,
    timeZone: 'UTC',
  }).format(toDateTimeTimestamp(value))
}
