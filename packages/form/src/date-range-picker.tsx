import { DismissableLayer, FloatingPositioner, FocusScope } from '@hozo/behaviors'
import { type ReactNode, useCallback, useId, useRef, useState } from 'react'

import { HozoCalendar, type HozoCalendarDay } from './calendar.tsx'
import { rangeLabel } from './calendar-format.ts'
import type { CalendarDate, CalendarMonth, CalendarRange, Weekday } from './calendar-rules.ts'

export interface HozoDateRangePickerProps {
  className?: string
  triggerClassName?: string
  dialogClassName?: string
  calendarClassName?: string
  dayClassName?: string
  value?: CalendarRange | null
  onChange?: (range: CalendarRange) => void
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
   * How the chosen range reads on the button.
   *
   * Defaults to `rangeLabel`, which asks `Intl` to write the phrase. An
   * application that wants "2026-09-10 to 2026-09-12" supplies this, because
   * the short forms are a design decision rather than an accessibility one --
   * the button's accessible name is this text, so whatever it returns is what
   * is spoken.
   */
  formatValue?: (range: CalendarRange, locale?: string) => string
  /**
   * The chrome's words, because Hozo does not own a message catalogue.
   *
   * #157 leaves string extraction to `i18next` and its peers; the dates
   * themselves come from `Intl` and need no dictionary.
   */
  placeholder?: string
  /** Only reached when `Intl` will not write the range; see `rangeLabel`. */
  rangeSeparator?: string
  dialogLabel?: string
  previousMonthLabel?: string
  nextMonthLabel?: string
  /** The word that marks today on Native; see `Calendar`. */
  todayLabel?: string
  /** What the two ends of the range are called; see `Calendar`. */
  rangeStartLabel?: string
  rangeEndLabel?: string
  /** Names the button when the caller wants something other than its text. */
  accessibilityLabel?: string
  renderDay?: (day: HozoCalendarDay) => ReactNode
}

/**
 * A button that opens a range `Calendar` in a dialog.
 *
 * `DatePicker`'s shape over the grid #546 added, and the last of the four
 * #148 lists. The behaviours are the same three: `FloatingPositioner`,
 * `DismissableLayer` and `FocusScope`, with the scope's own `autoFocus` off
 * and the grid's on, because APG puts the opening focus on a day rather than
 * on the previous-month button.
 *
 * It closes when the range arrives, which is `DatePicker`'s rule and not a
 * different one: a range `Calendar` reports only a range that has both ends,
 * so the press that fires `onChange` is the press that finished the job.
 * `DateTimePicker` needed a Done button because its two halves complete
 * independently; here there is nothing left to say.
 *
 * The half-chosen start lives in the `Calendar`, so dismissing the dialog
 * discards it by unmounting -- there is no partial range to clear here, and
 * none is ever handed out.
 */
export function HozoDateRangePicker({
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
  formatValue,
  placeholder = 'Select dates',
  rangeSeparator,
  dialogLabel = 'Choose a range of dates',
  previousMonthLabel,
  nextMonthLabel,
  todayLabel,
  rangeStartLabel,
  rangeEndLabel,
  accessibilityLabel,
  renderDay,
}: HozoDateRangePickerProps) {
  const id = useId()
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

  const choose = (range: CalendarRange) => {
    onChange?.(range)
    change(false)
  }

  const text = value
    ? (formatValue?.(value, locale) ?? rangeLabel(value, locale, { separator: rangeSeparator }))
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
                    range
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
                    rangeStartLabel={rangeStartLabel}
                    rangeEndLabel={rangeEndLabel}
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

export {
  HozoDateRangePicker as DateRangePicker,
  type HozoDateRangePickerProps as DateRangePickerProps,
}
