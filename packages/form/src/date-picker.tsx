import { DismissableLayer, FloatingPositioner, FocusScope } from '@hozo/behaviors'
import { type ReactNode, useCallback, useId, useRef, useState } from 'react'

import { HozoCalendar, type HozoCalendarDay } from './calendar.tsx'
import { dayLabel } from './calendar-format.ts'
import type { CalendarDate, CalendarMonth, Weekday } from './calendar-rules.ts'

export interface HozoDatePickerProps {
  className?: string
  triggerClassName?: string
  dialogClassName?: string
  calendarClassName?: string
  dayClassName?: string
  value?: CalendarDate | null
  onChange?: (date: CalendarDate) => void
  /** Open when it mounts. Uncontrolled after that, like `defaultMonth`. */
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  defaultMonth?: CalendarMonth
  /** The month the grid shows, when the caller wants to own it. */
  month?: CalendarMonth
  onMonthChange?: (month: CalendarMonth) => void
  min?: CalendarDate
  max?: CalendarDate
  /** A BCP 47 tag for the month, weekday and day names. */
  locale?: string
  firstDayOfWeek?: Weekday
  /** Which day the grid marks as today. A prop so a test can pin it. */
  today?: CalendarDate
  weeks?: number
  disabled?: boolean
  /**
   * How the chosen date reads on the button.
   *
   * Defaults to the same long form the grid cells use. An application that
   * wants "2026-09-24" or "Sep 24" supplies it, because the short forms are
   * a design decision rather than an accessibility one -- the button's
   * accessible name is this text, so whatever it returns is what is spoken.
   */
  formatValue?: (date: CalendarDate, locale?: string) => string
  /**
   * The chrome's words, because Hozo does not own a message catalogue.
   *
   * #157 leaves string extraction to `i18next` and its peers; the dates
   * themselves come from `Intl` and need no dictionary.
   */
  placeholder?: string
  dialogLabel?: string
  previousMonthLabel?: string
  nextMonthLabel?: string
  /** The word that marks today on Native; see `Calendar`. */
  todayLabel?: string
  /** Names the button when the caller wants something other than its text. */
  accessibilityLabel?: string
  renderDay?: (day: HozoCalendarDay) => ReactNode
}

/**
 * A button that opens a `Calendar` in a dialog.
 *
 * The composition #148 describes, and the pieces are the ones already in
 * `@hozo/behaviors`: `FloatingPositioner` puts the panel against the button
 * and flips it when there is no room, `DismissableLayer` closes it on Escape
 * and on a press outside, and `FocusScope` traps Tab inside it and returns
 * focus to the button when it goes away.
 *
 * `FocusScope`'s own `autoFocus` is turned off and the grid's is turned on
 * instead. The difference matters: the scope would focus the first tabbable
 * thing in the dialog, which is the previous-month button, and APG puts the
 * opening focus on the day the grid is showing.
 */
export function HozoDatePicker({
  className,
  triggerClassName,
  dialogClassName,
  calendarClassName,
  dayClassName,
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
  firstDayOfWeek,
  today,
  weeks,
  disabled,
  formatValue = dayLabel,
  placeholder = 'Select a date',
  dialogLabel = 'Choose a date',
  previousMonthLabel,
  nextMonthLabel,
  todayLabel,
  accessibilityLabel,
  renderDay,
}: HozoDatePickerProps) {
  const base = useId()
  const [open, setOpen] = useState(defaultOpen)
  // A stable ref object, not a fresh one per render: `useFloatingPosition`
  // lists `anchorRef` among its effect dependencies, so a new object each
  // time would tear down and rebuild the observers on every render.
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  const change = useCallback(
    (next: boolean) => {
      setOpen(next)
      onOpenChange?.(next)
    },
    [onOpenChange],
  )

  const choose = (date: CalendarDate) => {
    onChange?.(date)
    change(false)
  }

  return (
    <div className={className}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? `${base}-dialog` : undefined}
        aria-label={accessibilityLabel}
        disabled={disabled}
        className={triggerClassName}
        onClick={() => change(!open)}
      >
        {value ? formatValue(value, locale) : placeholder}
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
                  id={`${base}-dialog`}
                  aria-label={dialogLabel}
                  className={dialogClassName}
                >
                  <HozoCalendar
                    autoFocus
                    className={calendarClassName}
                    dayClassName={dayClassName}
                    value={value}
                    onChange={choose}
                    defaultMonth={defaultMonth}
                    month={month}
                    onMonthChange={onMonthChange}
                    min={min}
                    max={max}
                    locale={locale}
                    firstDayOfWeek={firstDayOfWeek}
                    today={today}
                    weeks={weeks}
                    previousMonthLabel={previousMonthLabel}
                    nextMonthLabel={nextMonthLabel}
                    todayLabel={todayLabel}
                    renderDay={renderDay}
                  />
                </div>
              </FocusScope>
            </DismissableLayer>
          )}
        </FloatingPositioner>
      ) : null}
    </div>
  )
}

export { HozoDatePicker as DatePicker, type HozoDatePickerProps as DatePickerProps }
