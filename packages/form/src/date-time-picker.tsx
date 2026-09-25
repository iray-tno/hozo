import { DismissableLayer, FloatingPositioner, FocusScope } from '@hozo/behaviors'
import { type ReactNode, useCallback, useId, useRef, useState } from 'react'

import { HozoCalendar, type HozoCalendarDay } from './calendar.tsx'
import {
  type CalendarDate,
  type CalendarMonth,
  todayLocal,
  type Weekday,
} from './calendar-rules.ts'
import { dateTimeLabel } from './date-time-format.ts'
import {
  type CalendarDateTime,
  clampDateTime,
  dateBounds,
  dateOf,
  mergeDateTime,
  timeBoundsOn,
  timeOf,
  withTime,
} from './date-time-rules.ts'
import { HozoTimePicker } from './time-picker.tsx'
import type { CalendarTime } from './time-rules.ts'

/**
 * Everything the time half needs, worked out from the date half.
 *
 * Handed to `children` so that a caller who wants a `Listbox` of slots, or a
 * `TimePicker` with a fifteen-minute step, writes that control themselves
 * without `DateTimePicker` having to forward the props of either.
 */
export interface HozoDateTimeHalf {
  /** `null` until a value exists, which is what an empty field shows. */
  value: CalendarTime | null
  onChange: (time: CalendarTime) => void
  /** The bound that applies *on the chosen day*; see `timeBoundsOn`. */
  min?: CalendarTime
  max?: CalendarTime
  locale?: string
  hour12?: boolean
  disabled?: boolean
}

export interface HozoDateTimePickerProps {
  className?: string
  triggerClassName?: string
  dialogClassName?: string
  calendarClassName?: string
  dayClassName?: string
  doneClassName?: string
  value?: CalendarDateTime | null
  onChange?: (value: CalendarDateTime) => void
  /** Open when it mounts. Uncontrolled after that, like `defaultMonth`. */
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  defaultMonth?: CalendarMonth
  /** The month the grid shows, when the caller wants to own it. */
  month?: CalendarMonth
  onMonthChange?: (month: CalendarMonth) => void
  /** Whole values, so a bound can name a time on a day rather than a day. */
  min?: CalendarDateTime
  max?: CalendarDateTime
  /** A BCP 47 tag for the month, weekday, day and hour names. */
  locale?: string
  /** Overrides what the locale implies; see `usesTwelveHour`. */
  hour12?: boolean
  firstDayOfWeek?: Weekday
  /** Which day the grid marks as today. A prop so a test can pin it. */
  today?: CalendarDate
  weeks?: number
  disabled?: boolean
  /**
   * How the value reads on the button, and therefore how it is spoken.
   *
   * Defaults to `dateTimeLabel`, the long form. A short one is a design
   * decision and a spoken accessible name is not, which is why the default is
   * the same text for both.
   */
  formatValue?: (value: CalendarDateTime, locale?: string) => string
  /**
   * The chrome's words, because Hozo does not own a message catalogue.
   *
   * #157 leaves string extraction to `i18next` and its peers; the dates and
   * times themselves come from `Intl` and need no dictionary.
   */
  placeholder?: string
  dialogLabel?: string
  doneLabel?: string
  previousMonthLabel?: string
  nextMonthLabel?: string
  /** The word that marks today on Native; see `Calendar`. */
  todayLabel?: string
  /** Names the button when the caller wants something other than its text. */
  accessibilityLabel?: string
  renderDay?: (day: HozoCalendarDay) => ReactNode
  /**
   * The time half. A `TimePicker` when it is left out.
   *
   * A render prop rather than a cloned element. #148 records why the time
   * half is the caller's choice -- a spinbutton expresses a continuum and a
   * list expresses a set with holes in it -- and injecting props into
   * whatever element was passed would quietly overwrite the ones the caller
   * wrote, and could not reach a `Listbox` at all, whose value is an option
   * rather than a `CalendarTime`.
   */
  children?: (time: HozoDateTimeHalf) => ReactNode
}

/** Where the clock starts on a day with no lower bound of its own. */
const MIDNIGHT: CalendarTime = { hour: 0, minute: 0 }

/**
 * A button that opens a `Calendar` and a clock in one dialog.
 *
 * The composition #148 describes, assembled from the three behaviours
 * `DatePicker` uses. What differs is when it closes: picking a day cannot
 * dismiss a picker whose time is not set yet, so the dialog stays open and
 * carries an explicit Done button. Escape and a press outside still dismiss
 * it, and every change has been reported by then -- Done confirms nothing, it
 * only closes, which is why there is no Cancel beside it to imply otherwise.
 *
 * `onChange` fires from either half, always with a whole value. The day is
 * held internally so that one exists before a value does: moving the clock
 * first would otherwise have no date to attach to.
 */
export function HozoDateTimePicker({
  className,
  triggerClassName,
  dialogClassName,
  calendarClassName,
  dayClassName,
  doneClassName,
  value,
  onChange,
  defaultOpen = false,
  onOpenChange,
  defaultMonth,
  month,
  onMonthChange,
  min,
  max,
  locale,
  hour12,
  firstDayOfWeek,
  today,
  weeks,
  disabled,
  formatValue,
  placeholder = 'Select a date and time',
  dialogLabel = 'Choose a date and time',
  doneLabel = 'Done',
  previousMonthLabel,
  nextMonthLabel,
  todayLabel,
  accessibilityLabel,
  renderDay,
  children,
}: HozoDateTimePickerProps) {
  const id = useId()
  const [open, setOpen] = useState(defaultOpen)
  // A stable ref object, not a fresh one per render: `useFloatingPosition`
  // lists `anchorRef` among its effect dependencies, so a new object each
  // time would tear down and rebuild the observers on every render.
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  /**
   * The day the clock attaches to, whether or not a value exists yet.
   *
   * Seeded from the value, then from the lower bound, then from today -- the
   * order `TimePicker` starts an unset field on, and for its reason: an arrow
   * press has to land somewhere, and the lowest allowed point is the one
   * place that cannot be outside the bounds.
   */
  const [ownDay, setOwnDay] = useState<CalendarDate>(() => {
    if (value) return dateOf(value)
    return min ? dateOf(min) : todayLocal()
  })
  const day = value ? dateOf(value) : ownDay

  const change = useCallback(
    (next: boolean) => {
      setOpen(next)
      onOpenChange?.(next)
    },
    [onOpenChange],
  )

  const bounds = { min, max }
  const clock = timeBoundsOn(day, bounds)

  const chooseDay = (date: CalendarDate) => {
    setOwnDay(date)
    // Whatever time is showing, moved onto the new day, and raised into that
    // day's window when it lands below it.
    const whole = value ? { ...value, ...date } : mergeDateTime(date, clock.min ?? MIDNIGHT)
    onChange?.(clampDateTime(whole, bounds))
  }

  const chooseTime = (time: CalendarTime) => {
    const whole = value ? withTime(value, time) : mergeDateTime(day, time)
    onChange?.(clampDateTime(whole, bounds))
  }

  const half: HozoDateTimeHalf = {
    value: value ? timeOf(value) : null,
    onChange: chooseTime,
    ...clock,
    locale,
    hour12,
    disabled,
  }

  const text = value
    ? (formatValue?.(value, locale) ?? dateTimeLabel(value, locale, { hour12 }))
    : placeholder

  return (
    <div className={className}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? `${id}-dialog` : undefined}
        aria-label={accessibilityLabel}
        disabled={disabled}
        className={triggerClassName}
        onClick={() => change(!open)}
      >
        {text}
      </button>
      {open ? (
        <FloatingPositioner anchorRef={triggerRef} placement="bottom-start" offset={4} flip shift>
          {() => (
            <DismissableLayer onDismiss={() => change(false)}>
              {/*
                `aria-modal` with the focus trap that backs it. Announcing a
                modal without trapping Tab is the worse half of the pair: a
                screen reader stops offering the rest of the page while the
                keyboard walks straight out of the dialog.
              */}
              <FocusScope autoFocus={false} restoreFocus>
                <div
                  role="dialog"
                  aria-modal="true"
                  id={`${id}-dialog`}
                  aria-label={dialogLabel}
                  className={dialogClassName}
                >
                  <HozoCalendar
                    autoFocus
                    className={calendarClassName}
                    dayClassName={dayClassName}
                    value={value ? dateOf(value) : null}
                    onChange={chooseDay}
                    defaultMonth={defaultMonth}
                    month={month}
                    onMonthChange={onMonthChange}
                    {...dateBounds(bounds)}
                    locale={locale}
                    firstDayOfWeek={firstDayOfWeek}
                    today={today}
                    weeks={weeks}
                    previousMonthLabel={previousMonthLabel}
                    nextMonthLabel={nextMonthLabel}
                    todayLabel={todayLabel}
                    renderDay={renderDay}
                  />
                  {children ? children(half) : <HozoTimePicker {...half} />}
                  <button type="button" className={doneClassName} onClick={() => change(false)}>
                    {doneLabel}
                  </button>
                </div>
              </FocusScope>
            </DismissableLayer>
          )}
        </FloatingPositioner>
      ) : null}
    </div>
  )
}

export {
  type HozoDateTimeHalf as DateTimeHalf,
  HozoDateTimePicker as DateTimePicker,
  type HozoDateTimePickerProps as DateTimePickerProps,
}
