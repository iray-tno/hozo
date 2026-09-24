import { type ReactNode, useState } from 'react'
import { Pressable, type StyleProp, Text, type TextStyle, View, type ViewStyle } from 'react-native'

import { dayLabel, dayNumber, monthLabel, weekdayLabels } from './calendar-format.ts'
import {
  addMonths,
  type CalendarCell,
  type CalendarDate,
  type CalendarMonth,
  type CalendarRange,
  compareDates,
  daysInMonth,
  isSameDay,
  isWithin,
  isWithinRange,
  monthGrid,
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
  /**
   * On the Web this holds the grid's single tab stop.
   *
   * Carried here so one `renderDay` works on both platforms, and always
   * `false`: there is no roving tab index to hold, because React Native has
   * no tab order to rove within.
   */
  focused: boolean
}

interface Shared {
  /**
   * Tailwind classes, the same prop the Web half takes.
   *
   * On a tag the compiler lowers it is gone by runtime, replaced by a
   * `StyleSheet` entry. Anywhere else it is carried and ignored here --
   * this side has no CSS engine to resolve a class list against -- and
   * the type still has to accept it, because an app is type-checked
   * against the source the compiler reads rather than its output.
   */
  className?: string
  dayClassName?: string
  headerClassName?: string
  style?: StyleProp<ViewStyle>
  headerStyle?: StyleProp<ViewStyle>
  weekStyle?: StyleProp<ViewStyle>
  dayStyle?: StyleProp<ViewStyle>
  dayTextStyle?: StyleProp<TextStyle>
  /** The month shown first. Defaults to `value`'s month, else `today`'s. */
  defaultMonth?: CalendarMonth
  /**
   * The month shown, when the caller wants to own it.
   *
   * Controlled in the ordinary React sense: while this is set the grid shows
   * what it says and nothing else moves it, so a month that should change on
   * its own has to change through `onMonthChange`. A caller that hands over a
   * `month` and ignores `onMonthChange` gets paging buttons that appear to do
   * nothing -- the same bargain a controlled `<input>` makes.
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
   * Carried and ignored, like `className`.
   *
   * On the Web this puts DOM focus on the focused day when the grid mounts.
   * React Native has no DOM focus to move and no tab order to move it
   * within, so the prop has nothing to do here -- but the type still has to
   * accept it, or one piece of universal source would stop compiling on one
   * of the two platforms.
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
   * The word that marks today, because nothing else can.
   *
   * The Web half says `aria-current="date"` and a screen reader supplies the
   * wording in its own language. React Native has no equivalent: there is no
   * `current` in `accessibilityState`, and `setStateDescription` -- which
   * would be the semantic home for it -- is not reachable from JavaScript
   * (`docs/decisions/001`). So the only channel is text, and text needs a
   * word, and a word has to be the application's.
   *
   * It goes through `accessibilityValue.text` rather than into
   * `accessibilityLabel`. `BaseViewManager` joins label, state descriptions
   * and value text with ", " into one `contentDescription`, so React Native
   * composes "Thursday, September 24, 2026, today" and the label stays the
   * date. Empty opts out.
   */
  todayLabel?: string
  renderDay?: (day: HozoCalendarDay) => ReactNode
}

/** One day at a time. */
export interface HozoCalendarSingleProps extends Shared {
  range?: false
  value?: CalendarDate | null
  onChange?: (date: CalendarDate) => void
}

/**
 * Two days and everything between them.
 *
 * Discriminated props rather than a second component, following
 * `@hozo/patterns`' `Listbox`. `onChange` fires with a complete range and
 * never with half of one: the first press is held internally, so a caller is
 * never handed a start with no end.
 */
export interface HozoCalendarRangeProps extends Shared {
  range: true
  value?: CalendarRange | null
  onChange?: (range: CalendarRange) => void
  /**
   * The words the ends are announced with, on top of their dates.
   *
   * `accessibilityState.selected` says a day is in the range and cannot say
   * which end it is. So the ends say it in text, joined onto `todayLabel`'s
   * channel -- `accessibilityValue.text` -- because that is the one slot React
   * Native gives a view for something that is neither its name nor a state it
   * knows the word for (#526).
   */
  rangeStartLabel?: string
  rangeEndLabel?: string
}

export type HozoCalendarProps = HozoCalendarSingleProps | HozoCalendarRangeProps

const cellKey = (date: CalendarDate) => `${date.year}-${date.month}-${date.day}`

/** The selection as a range, whichever shape it arrived in. */
function chosenRange(props: HozoCalendarProps): CalendarRange | null {
  if (props.range === true) return props.value ?? null
  if (!props.value) return null
  return { start: props.value, end: props.value }
}

/**
 * Everything a cell is. A pending start counts as a range of one day, so the
 * person who has just pressed it hears that they chose something.
 */
function dayState(
  cell: CalendarCell,
  at: {
    ranged: boolean
    chosen: CalendarRange | null
    pending: CalendarDate | null
    today: CalendarDate
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
    focused: false,
  }
}

/**
 * The words that go in `accessibilityValue.text`, joined here rather than by
 * React Native.
 *
 * `BaseViewManager` joins the label, the state descriptions and this into one
 * `contentDescription`, but it is one slot -- so a day that is both today and
 * the start of a range has to arrive already joined. Comma and a space, the
 * same separator React Native would have used.
 */
function spokenExtras(
  day: HozoCalendarDay,
  words: { todayLabel?: string; rangeStartLabel?: string; rangeEndLabel?: string },
): string {
  const said: string[] = []
  if (day.rangeStart && words.rangeStartLabel) said.push(words.rangeStartLabel)
  else if (day.rangeEnd && words.rangeEndLabel) said.push(words.rangeEndLabel)
  if (day.today && words.todayLabel) said.push(words.todayLabel)
  return said.join(', ')
}

const weekKey = (week: readonly CalendarCell[]) => {
  const opening = week[0]
  return opening ? cellKey(opening.date) : ''
}

/** Whether a whole month sits outside the bounds, so paging to it is pointless. */
function monthIsReachable(month: CalendarMonth, min?: CalendarDate, max?: CalendarDate): boolean {
  const last = { ...month, day: daysInMonth(month.year, month.month) }
  if (min && compareDates(last, min) < 0) return false
  if (max && compareDates({ ...month, day: 1 }, max) > 0) return false
  return true
}

function monthStep(month: CalendarMonth, months: number): CalendarMonth {
  const at = addMonths({ ...month, day: 1 }, months)
  return { year: at.year, month: at.month }
}

/**
 * A month grid for React Native, reached by touch rather than by arrow keys.
 *
 * The keyboard half of the Web component has no counterpart here, and its
 * absence is the platform rather than an omission: React Native has no tab
 * order, `View` takes no `tabIndex`, and hardware key events reach only a
 * `TextInput`. So this side carries no roving focus and no `moveFocus` --
 * every day is its own `Pressable`, which is what TalkBack and VoiceOver
 * walk and what a finger lands on.
 *
 * Each day's accessible name is the whole date, weekday included, matching
 * the Web half. The weekday header is a row of plain text kept out of the
 * accessibility tree, since the names already say which day they are.
 */
export function HozoCalendar(props: HozoCalendarProps) {
  const {
    style,
    headerStyle,
    weekStyle,
    dayStyle,
    dayTextStyle,
    defaultMonth,
    month,
    onMonthChange,
    min,
    max,
    locale,
    firstDayOfWeek,
    today,
    weeks,
    accessibilityLabel,
    previousMonthLabel = 'Previous month',
    nextMonthLabel = 'Next month',
    todayLabel = 'today',
    renderDay,
  } = props

  const currentDay = today ?? todayLocal()
  const weekStart = firstDayOfWeek ?? weekStartFor(locale)

  // Held as a range on both paths, the way the Web half does and for the same
  // reason: a single selection is a range whose ends are the same day, so
  // every question about a cell has one answer to read.
  const ranged = props.range === true
  const chosen = chosenRange(props)
  const [pending, setPending] = useState<CalendarDate | null>(null)
  const rangeStartLabel =
    props.range === true ? (props.rangeStartLabel ?? 'start of range') : undefined
  const rangeEndLabel = props.range === true ? (props.rangeEndLabel ?? 'end of range') : undefined

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

  const opening = chosen?.start ?? currentDay
  const [ownMonth, setOwnMonth] = useState<CalendarMonth>(
    () => defaultMonth ?? { year: opening.year, month: opening.month },
  )
  const controlled = month !== undefined
  const shown = month ?? ownMonth

  // Not inside a `setOwnMonth` updater, where it used to be. An updater has
  // to be pure -- React is free to run it twice -- and a listener called from
  // inside one is called twice with it.
  const page = (months: number) => {
    const next = monthStep(shown, months)
    if (!controlled) setOwnMonth(next)
    onMonthChange?.(next)
  }

  const labels = weekdayLabels(weekStart, locale)
  const grid = monthGrid({ year: shown.year, month: shown.month, firstDayOfWeek: weekStart, weeks })

  return (
    <View accessibilityRole="grid" accessibilityLabel={accessibilityLabel} style={style}>
      <View style={headerStyle}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={previousMonthLabel}
          accessibilityState={{ disabled: !monthIsReachable(monthStep(shown, -1), min, max) }}
          disabled={!monthIsReachable(monthStep(shown, -1), min, max)}
          onPress={() => page(-1)}
        >
          <Text>{'‹'}</Text>
        </Pressable>
        {/*
          `accessibilityLiveRegion` so Android announces the month when the
          paging buttons change it. iOS has no equivalent on a `View`; there
          the day cells carry the month in their own names, which is what a
          VoiceOver user hears on arriving at one.
        */}
        <Text accessibilityLiveRegion="polite">{monthLabel(shown, locale)}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={nextMonthLabel}
          accessibilityState={{ disabled: !monthIsReachable(monthStep(shown, 1), min, max) }}
          disabled={!monthIsReachable(monthStep(shown, 1), min, max)}
          onPress={() => page(1)}
        >
          <Text>{'›'}</Text>
        </Pressable>
      </View>
      <View importantForAccessibility="no-hide-descendants" style={weekStyle}>
        {labels.map((label) => (
          <Text key={label.long}>{label.short}</Text>
        ))}
      </View>
      {grid.map((week) => (
        <View key={weekKey(week)} style={weekStyle}>
          {week.map((cell) => {
            const day = dayState(cell, {
              ranged,
              chosen,
              pending,
              today: currentDay,
              bounds: { min, max },
            })
            const said = spokenExtras(day, { todayLabel, rangeStartLabel, rangeEndLabel })
            return (
              <Pressable
                key={cellKey(cell.date)}
                accessibilityRole="button"
                accessibilityLabel={dayLabel(cell.date, locale)}
                accessibilityState={{ selected: day.selected, disabled: day.disabled }}
                accessibilityValue={said ? { text: said } : undefined}
                disabled={day.disabled}
                style={dayStyle}
                onPress={() => choose(cell.date)}
              >
                {renderDay ? (
                  renderDay(day)
                ) : (
                  <Text style={dayTextStyle}>{dayNumber(cell.date, locale)}</Text>
                )}
              </Pressable>
            )
          })}
        </View>
      ))}
    </View>
  )
}

export { HozoCalendar as Calendar, type HozoCalendarProps as CalendarProps }
