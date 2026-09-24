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
  type CalendarRange,
  compareDates,
  daysInMonth,
  isSameDay,
  isWithin,
  isWithinRange,
  monthGrid,
  moveFocus,
  orderRange,
  todayLocal,
  type Weekday,
  firstDayOfWeek as weekStartFor,
} from './calendar-rules.ts'

export interface HozoCalendarDay {
  date: CalendarDate
  /** From a neighbouring month, drawn so the weeks are whole. */
  outside: boolean
  /** Chosen, which for a range means anywhere in it including both ends. */
  selected: boolean
  /** The first day of a range, and false in single mode. */
  rangeStart: boolean
  /** The last day of a range, and false in single mode. */
  rangeEnd: boolean
  /** Between the ends rather than at one, so a style can fill the middle. */
  inRange: boolean
  /** Today where the viewer is, or whatever `today` was set to. */
  today: boolean
  /** Outside `min`/`max`, so it cannot be chosen. */
  disabled: boolean
  /** Holds the grid's single tab stop. */
  focused: boolean
}

interface Shared {
  className?: string
  /** On the `<td>` that is the grid cell, so `disabled:` variants reach it. */
  dayClassName?: string
  headerClassName?: string
  /** The month shown first. Defaults to `value`'s month, else `today`'s. */
  defaultMonth?: CalendarMonth
  /**
   * The month shown, when the caller wants to own it.
   *
   * Controlled in the ordinary React sense: while this is set the grid shows
   * what it says and nothing else moves it, so a month that should change on
   * its own has to change through `onMonthChange`. A caller that hands over a
   * `month` and ignores `onMonthChange` gets a grid whose paging buttons and
   * month-crossing arrow keys appear to do nothing -- the same bargain a
   * controlled `<input>` makes, and worth saying out loud because here the
   * keys that stop working are in the middle of the widget.
   *
   * Wins over `defaultMonth`, which is then the initial value of state
   * nothing reads.
   */
  month?: CalendarMonth
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
  /**
   * Carried and ignored, like `autoFocus` is on the Native half.
   *
   * Today is marked with `aria-current="date"` here, and a screen reader
   * supplies the wording in its own language -- so a word from the caller
   * would be a second announcement of the same fact, in one language.
   *
   * React Native has no `aria-current`, no `current` in
   * `accessibilityState`, and no reachable `setStateDescription`
   * (`docs/decisions/001`), so text is the only channel it has and the word
   * has to come from somewhere. The prop exists for that half and is
   * accepted here so one piece of source compiles on both.
   */
  todayLabel?: string
  renderDay?: (day: HozoCalendarDay) => ReactNode
}

/**
 * One day at a time, which is what a grid does without being told otherwise.
 */
export interface HozoCalendarSingleProps extends Shared {
  range?: false
  value?: CalendarDate | null
  onChange?: (date: CalendarDate) => void
}

/**
 * Two days and everything between them.
 *
 * Discriminated props rather than a second component, following
 * `@hozo/patterns`' `Listbox`: its single and multiple halves differ in the
 * type of one value and share everything else, and so do these. A
 * `RangeCalendar` beside this one would be forty-two cells of rendering and a
 * Native half kept in step by hand.
 *
 * `onChange` fires with a **complete** range and never with half of one. The
 * first click is held internally, so a caller is never handed a start with no
 * end and never has to model a state it cannot finish.
 */
export interface HozoCalendarRangeProps extends Shared {
  range: true
  value?: CalendarRange | null
  onChange?: (range: CalendarRange) => void
  /**
   * The words the ends are announced with, on top of their dates.
   *
   * `aria-selected` says a day is in the range and cannot say which end it
   * is, so the ends say it in their names -- which is what React Aria's range
   * calendar does, and the only channel that carries it on both platforms.
   */
  rangeStartLabel?: string
  rangeEndLabel?: string
}

export type HozoCalendarProps = HozoCalendarSingleProps | HozoCalendarRangeProps

const cellKey = (date: CalendarDate) => `${date.year}-${date.month}-${date.day}`

const weekKey = (week: readonly CalendarCell[]) => {
  const opening = week[0]
  return opening ? cellKey(opening.date) : ''
}

/**
 * The selection as a range, whichever shape it arrived in.
 *
 * A module function rather than an expression in the body, so the union is
 * narrowed by `range` itself: a derived boolean does not narrow `props`, and
 * casting the value instead would put the discriminant and the type it
 * decides out of each other's sight.
 */
function chosenRange(props: HozoCalendarProps): CalendarRange | null {
  if (props.range === true) return props.value ?? null
  if (!props.value) return null
  return { start: props.value, end: props.value }
}

/**
 * Everything a cell is, worked out once for both the markup and `renderDay`.
 *
 * A pending start counts as selected and as both ends of a range of one day.
 * It is the only thing on the grid at that moment, and a person who has just
 * clicked it should hear that they chose something rather than nothing.
 */
function dayState(
  cell: CalendarCell,
  at: {
    ranged: boolean
    chosen: CalendarRange | null
    pending: CalendarDate | null
    today: CalendarDate
    focused: CalendarDate
    bounds: { min?: CalendarDate; max?: CalendarDate }
  },
): HozoCalendarDay {
  const range = at.pending ? { start: at.pending, end: at.pending } : at.chosen
  const selected = range ? isWithinRange(cell.date, range) : false
  // Only in range mode, so a single grid's one selected day does not also
  // answer to the range selectors and pick up an end cap in someone's CSS.
  const ends = at.ranged ? range : null
  const rangeStart = ends !== null && isSameDay(cell.date, ends.start)
  const rangeEnd = ends !== null && isSameDay(cell.date, ends.end)
  return {
    date: cell.date,
    outside: cell.outside,
    selected,
    rangeStart,
    rangeEnd,
    inRange: ends !== null && selected && !rangeStart && !rangeEnd,
    today: isSameDay(cell.date, at.today),
    disabled: !isWithin(cell.date, at.bounds),
    focused: isSameDay(cell.date, at.focused),
  }
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
export function HozoCalendar(props: HozoCalendarProps) {
  const {
    className,
    dayClassName,
    headerClassName,
    defaultMonth,
    month,
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
  } = props
  const ranged = props.range === true

  const currentDay = today ?? todayLocal()
  const weekStart = firstDayOfWeek ?? weekStartFor(locale)

  // Held as a range on both paths, the way `Listbox` holds an array on both
  // of its. A single selection is a range whose ends are the same day, so
  // every question below -- is this cell chosen, is it an end, is it between
  // them -- has one answer to read rather than two to keep in step.
  const chosen = chosenRange(props)

  /**
   * The first day of a range that has no second day yet.
   *
   * Internal, and never handed out. `onChange` fires with a complete range or
   * not at all, so a caller is never given a start with no end and never has
   * to model a state it cannot finish. The grid still shows it, because the
   * person choosing needs to see where they started.
   */
  const [pending, setPending] = useState<CalendarDate | null>(null)

  const opening = chosen?.start ?? currentDay
  const [ownMonth, setOwnMonth] = useState<CalendarMonth>(
    () => defaultMonth ?? { year: opening.year, month: opening.month },
  )
  const controlled = month !== undefined
  const shown = month ?? ownMonth
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
    (next: CalendarMonth) => {
      if (!controlled) setOwnMonth(next)
      onMonthChange?.(next)
    },
    [controlled, onMonthChange],
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

  /**
   * What a click or an Enter does, which is one thing in single mode and half
   * of one in range mode.
   *
   * Narrowed on `props.range` rather than on the derived boolean above,
   * because that is what tells TypeScript which `onChange` it is holding.
   */
  const choose = (date: CalendarDate) => {
    if (!isWithin(date, { min, max })) return
    if (props.range !== true) {
      props.onChange?.(date)
      return
    }
    if (pending === null) {
      setPending(date)
      return
    }
    setPending(null)
    props.onChange?.(orderRange(pending, date))
  }

  const rangeStartLabel =
    props.range === true ? (props.rangeStartLabel ?? 'start of range') : undefined
  const rangeEndLabel = props.range === true ? (props.rangeEndLabel ?? 'end of range') : undefined

  /**
   * A cell's accessible name, with the end it is on when it is on one.
   *
   * The start wins when a range is one day long, which is what a pending
   * start is: "the 10th, start of range" is the sentence someone who has just
   * clicked once needs to hear.
   */
  const nameOf = (day: HozoCalendarDay) => {
    const base = dayLabel(day.date, locale)
    if (day.rangeStart && rangeStartLabel) return `${base}, ${rangeStartLabel}`
    if (day.rangeEnd && rangeEndLabel) return `${base}, ${rangeEndLabel}`
    return base
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTableCellElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      choose(focused)
      return
    }
    // A range half-chosen and then abandoned would leave the grid showing a
    // start nothing can complete, so Escape puts it back.
    if (event.key === 'Escape' && pending !== null) {
      event.preventDefault()
      setPending(null)
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
        aria-multiselectable={ranged ? true : undefined}
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
                const day = dayState(cell, {
                  ranged,
                  chosen,
                  pending,
                  today: currentDay,
                  focused,
                  bounds: { min, max },
                })
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
                    aria-label={nameOf(day)}
                    aria-selected={day.selected}
                    aria-disabled={day.disabled || undefined}
                    aria-current={day.today ? 'date' : undefined}
                    data-hozo-outside={day.outside ? '' : undefined}
                    data-hozo-disabled={day.disabled ? '' : undefined}
                    data-hozo-range-start={day.rangeStart ? '' : undefined}
                    data-hozo-range-end={day.rangeEnd ? '' : undefined}
                    data-hozo-in-range={day.inRange ? '' : undefined}
                    tabIndex={day.focused ? 0 : -1}
                    className={dayClassName}
                    onKeyDown={onKeyDown}
                    onFocus={() => setFocused(cell.date)}
                    onClick={() => {
                      if (day.disabled) return
                      moveTo(cell.date)
                      choose(cell.date)
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
