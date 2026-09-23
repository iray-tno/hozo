import { type ReactNode, useCallback, useState } from 'react'
import { Pressable, type StyleProp, Text, type TextStyle, View, type ViewStyle } from 'react-native'

import { dayLabel, dayNumber, monthLabel, weekdayLabels } from './calendar-format.ts'
import {
  addMonths,
  type CalendarCell,
  type CalendarDate,
  type CalendarMonth,
  compareDates,
  daysInMonth,
  isSameDay,
  isWithin,
  monthGrid,
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
  /**
   * On the Web this holds the grid's single tab stop.
   *
   * Carried here so one `renderDay` works on both platforms, and always
   * `false`: there is no roving tab index to hold, because React Native has
   * no tab order to rove within.
   */
  focused: boolean
}

export interface HozoCalendarProps {
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
export function HozoCalendar({
  style,
  headerStyle,
  weekStyle,
  dayStyle,
  dayTextStyle,
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

  const page = useCallback(
    (months: number) => {
      setShown((previous) => {
        const next = monthStep(previous, months)
        onMonthChange?.(next)
        return next
      })
    },
    [onMonthChange],
  )

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
            const day: HozoCalendarDay = {
              date: cell.date,
              outside: cell.outside,
              selected: value ? isSameDay(cell.date, value) : false,
              today: isSameDay(cell.date, currentDay),
              disabled: !isWithin(cell.date, { min, max }),
              focused: false,
            }
            return (
              <Pressable
                key={cellKey(cell.date)}
                accessibilityRole="button"
                accessibilityLabel={dayLabel(cell.date, locale)}
                accessibilityState={{ selected: day.selected, disabled: day.disabled }}
                disabled={day.disabled}
                style={dayStyle}
                onPress={() => onChange?.(cell.date)}
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
