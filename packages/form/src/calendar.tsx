import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'

import { dayLabel, dayNumber, monthLabel, weekdayLabels } from './calendar-format.ts'
import {
  addMonths,
  addYears,
  type CalendarCell,
  type CalendarDate,
  type CalendarKey,
  type CalendarMonth,
  compareDates,
  daysInMonth,
  isSameDay,
  isWithin,
  monthGrid,
  moveFocus,
  todayLocal,
  type Weekday,
  firstDayOfWeek as weekStartFor,
} from './calendar-rules.ts'

export interface HozoCalendarDay {
  date: CalendarDate
  /** From a neighbouring month, drawn so the weeks are whole. */
  outside: boolean
  selected: boolean
  /** Today where the viewer is, or whatever `today` was set to. */
  today: boolean
  /** Outside `min`/`max`, so it cannot be chosen. */
  disabled: boolean
  /** Holds the grid's single tab stop. */
  focused: boolean
}

export interface HozoCalendarProps {
  className?: string
  /** On the `<td>` that is the grid cell, so `disabled:` variants reach it. */
  dayClassName?: string
  headerClassName?: string
  value?: CalendarDate | null
  onChange?: (date: CalendarDate) => void
  /** The month shown first. Defaults to `value`'s month, else `today`'s. */
  defaultMonth?: CalendarMonth
  onMonthChange?: (month: CalendarMonth) => void
  min?: CalendarDate
  max?: CalendarDate
  /** A BCP 47 tag for the month, weekday and day names. */
  locale?: string
  /** Overrides what `locale` implies; see `firstDayOfWeek` in the rules. */
  firstDayOfWeek?: Weekday
  /**
   * Which day to mark as today.
   *
   * A prop so a test does not depend on when it ran. Left out, it is the
   * viewer's own civil date.
   */
  today?: CalendarDate
  weeks?: number
  /**
   * Put DOM focus on the focused day as soon as the grid mounts.
   *
   * Off by default: a calendar sitting in a page has no business taking
   * focus from whatever the reader was on. `DatePicker` turns it on, because
   * a grid opened in a dialog is what the user asked for -- and it focuses
   * the day rather than the first button in the dialog, which is where
   * `FocusScope`'s own `autoFocus` would land.
   */
  autoFocus?: boolean
  accessibilityLabel?: string
  /**
   * The chrome's words, because Hozo does not own a message catalogue.
   *
   * #157 leaves string extraction to `i18next` and its peers; the dates
   * themselves come from `Intl` and need no dictionary.
   */
  previousMonthLabel?: string
  nextMonthLabel?: string
  renderDay?: (day: HozoCalendarDay) => ReactNode
}

const cellKey = (date: CalendarDate) => `${date.year}-${date.month}-${date.day}`

const weekKey = (week: readonly CalendarCell[]) => {
  const opening = week[0]
  return opening ? cellKey(opening.date) : ''
}

function readDirection(element: Element): string {
  if (typeof window === 'undefined') return 'ltr'
  return window.getComputedStyle(element).direction || 'ltr'
}

/** Whether a whole month sits outside the bounds, so paging to it is pointless. */
function monthIsReachable(month: CalendarMonth, min?: CalendarDate, max?: CalendarDate): boolean {
  const last = { ...month, day: daysInMonth(month.year, month.month) }
  if (min && compareDates(last, min) < 0) return false
  if (max && compareDates({ ...month, day: 1 }, max) > 0) return false
  return true
}

/**
 * A month grid, in the shape the ARIA grid pattern asks for.
 *
 * The focusable element is the `<td role="gridcell">` itself rather than a
 * button inside it. That is what a grid *is* -- cells reached by arrow keys
 * and activated with Enter -- and it keeps one element per day carrying the
 * name, the selected state and the tab stop. A button nested in a gridcell
 * would put two of them there and leave the announcement split across both.
 *
 * The header row is hidden from the accessibility tree. Each cell's name is
 * the whole date, weekday included, because a user arriving by arrow key
 * does not read the column header on the way in.
 */
export function HozoCalendar({
  className,
  dayClassName,
  headerClassName,
  value,
  onChange,
  defaultMonth,
  onMonthChange,
  min,
  max,
  locale,
  firstDayOfWeek,
  today,
  weeks,
  autoFocus,
  accessibilityLabel,
  previousMonthLabel = 'Previous month',
  nextMonthLabel = 'Next month',
  renderDay,
}: HozoCalendarProps) {
  const currentDay = today ?? todayLocal()
  const weekStart = firstDayOfWeek ?? weekStartFor(locale)
  const opening = value ?? currentDay
  const [shown, setShown] = useState<CalendarMonth>(
    () => defaultMonth ?? { year: opening.year, month: opening.month },
  )
  const [focused, setFocused] = useState<CalendarDate>(opening)
  const cells = useRef(new Map<string, HTMLTableCellElement | null>())
  // Seeded from `autoFocus` so the mount-time run of the effect below moves
  // focus the same way a key press does, rather than through a second path
  // that would have to agree with it.
  const takeFocus = useRef(autoFocus === true)
  const headingId = useId()

  // Only after a key moved it, so mounting the grid does not pull focus out
  // of whatever the page had. The cell may have arrived in this same render
  // -- an arrow key that leaves the month changes both pieces of state at
  // once -- which is why this reads the map rather than an element captured
  // when the key was handled.
  useEffect(() => {
    if (!takeFocus.current) return
    takeFocus.current = false
    cells.current.get(cellKey(focused))?.focus()
  }, [focused])

  const show = useCallback(
    (month: CalendarMonth) => {
      setShown(month)
      onMonthChange?.(month)
    },
    [onMonthChange],
  )

  const moveTo = (date: CalendarDate) => {
    takeFocus.current = true
    setFocused(date)
    if (date.year !== shown.year || date.month !== shown.month) {
      show({ year: date.year, month: date.month })
    }
  }

  const page = (months: number) => {
    const next = addMonths({ ...shown, day: 1 }, months)
    show({ year: next.year, month: next.month })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTableCellElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (isWithin(focused, { min, max })) onChange?.(focused)
      return
    }

    // Shift widens the page keys from a month to a year, which is the
    // convention every date grid follows and not something the rules module
    // should decide -- a modifier is a platform's idea, not a calendar's.
    if (event.shiftKey && (event.key === 'PageUp' || event.key === 'PageDown')) {
      const next = addYears(focused, event.key === 'PageUp' ? -1 : 1)
      event.preventDefault()
      if (isWithin(next, { min, max })) moveTo(next)
      return
    }

    const rtl = readDirection(event.currentTarget) === 'rtl'
    const next = moveFocus(focused, event.key as CalendarKey, {
      min,
      max,
      firstDayOfWeek: weekStart,
      rtl,
    })
    if (next === null) return
    event.preventDefault()
    moveTo(next)
  }

  const labels = weekdayLabels(weekStart, locale)
  const grid = monthGrid({ year: shown.year, month: shown.month, firstDayOfWeek: weekStart, weeks })
  const backReachable = monthIsReachable(monthBefore(shown), min, max)
  const forwardReachable = monthIsReachable(monthAfter(shown), min, max)

  return (
    <div role="group" aria-label={accessibilityLabel} className={className}>
      <div className={headerClassName}>
        <button
          type="button"
          aria-label={previousMonthLabel}
          disabled={!backReachable}
          onClick={() => page(-1)}
        >
          {'‹'}
        </button>
        {/*
          Announced when it changes, so paging with the buttons says where it
          landed. The cells carry their own full dates, so this is the only
          place the month is spoken.
        */}
        <div id={headingId} aria-live="polite">
          {monthLabel(shown, locale)}
        </div>
        <button
          type="button"
          aria-label={nextMonthLabel}
          disabled={!forwardReachable}
          onClick={() => page(1)}
        >
          {'›'}
        </button>
      </div>
      {/*
        A real table, because a grid is one. The rule below reads `grid` as an
        interactive role landing on a non-interactive element, which is true
        of most elements and false of this one: `grid` is defined in terms of
        rows and cells, and APG's own date picker is `<table role="grid">`.
      */}
      <table
        // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: a grid is a table
        role="grid"
        aria-labelledby={headingId}
      >
        <thead aria-hidden="true">
          <tr>
            {labels.map((label) => (
              <th key={label.long} scope="col" abbr={label.long}>
                {label.short}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.map((week) => (
            <tr key={weekKey(week)}>
              {week.map((cell) => {
                const day: HozoCalendarDay = {
                  date: cell.date,
                  outside: cell.outside,
                  selected: value ? isSameDay(cell.date, value) : false,
                  today: isSameDay(cell.date, currentDay),
                  disabled: !isWithin(cell.date, { min, max }),
                  focused: isSameDay(cell.date, focused),
                }
                return (
                  <td
                    key={cellKey(cell.date)}
                    ref={(node) => {
                      cells.current.set(cellKey(cell.date), node)
                    }}
                    // Same rule, same reason as the table above: a gridcell
                    // is what a `<td>` inside a grid is, and this one is
                    // focusable because the pattern says the cells are.
                    // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: grid cell
                    role="gridcell"
                    aria-label={dayLabel(cell.date, locale)}
                    aria-selected={day.selected}
                    aria-disabled={day.disabled || undefined}
                    aria-current={day.today ? 'date' : undefined}
                    data-hozo-outside={day.outside ? '' : undefined}
                    data-hozo-disabled={day.disabled ? '' : undefined}
                    tabIndex={day.focused ? 0 : -1}
                    className={dayClassName}
                    onKeyDown={onKeyDown}
                    onFocus={() => setFocused(cell.date)}
                    onClick={() => {
                      if (day.disabled) return
                      moveTo(cell.date)
                      onChange?.(cell.date)
                    }}
                  >
                    {renderDay ? renderDay(day) : dayNumber(cell.date, locale)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function monthBefore(month: CalendarMonth): CalendarMonth {
  const at = addMonths({ ...month, day: 1 }, -1)
  return { year: at.year, month: at.month }
}

function monthAfter(month: CalendarMonth): CalendarMonth {
  const at = addMonths({ ...month, day: 1 }, 1)
  return { year: at.year, month: at.month }
}

export { HozoCalendar as Calendar, type HozoCalendarProps as CalendarProps }
