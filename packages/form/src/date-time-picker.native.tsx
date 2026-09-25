import { type ReactNode, useCallback, useState } from 'react'
import {
  Modal,
  Pressable,
  type StyleProp,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native'

import { HozoCalendar, type HozoCalendarDay } from './calendar.native.tsx'
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
import { HozoTimePicker } from './time-picker.native.tsx'
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
  triggerClassName?: string
  dialogClassName?: string
  calendarClassName?: string
  dayClassName?: string
  doneClassName?: string
  style?: StyleProp<ViewStyle>
  triggerStyle?: StyleProp<ViewStyle>
  triggerTextStyle?: StyleProp<TextStyle>
  dialogStyle?: StyleProp<ViewStyle>
  doneStyle?: StyleProp<ViewStyle>
  doneTextStyle?: StyleProp<TextStyle>
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
 * A button that opens a `Calendar` and a clock in one modal.
 *
 * `Modal` rather than an anchored panel, for the reason `DatePicker`'s Native
 * half gives: React Native's own `Modal` is what takes over the window, sends
 * Android's back button to `onRequestClose`, and lets
 * `accessibilityViewIsModal` tell VoiceOver to stop offering what is behind
 * it. There is no focus trap and none is owed -- there is no tab order here
 * to trap.
 *
 * Done is a real control on this side too. A modal that dismissed itself when
 * a day was pressed would close before the clock had been touched, and the
 * back button is not a discoverable way to say "that will do".
 */
export function HozoDateTimePicker({
  style,
  triggerStyle,
  triggerTextStyle,
  dialogStyle,
  doneStyle,
  doneTextStyle,
  calendarClassName,
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
  const [open, setOpen] = useState(defaultOpen)

  /**
   * The day the clock attaches to, whether or not a value exists yet.
   *
   * Seeded from the value, then from the lower bound, then from today -- the
   * order `TimePicker` starts an unset field on, and for its reason: a step
   * has to land somewhere, and the lowest allowed point is the one place that
   * cannot be outside the bounds.
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
    <View style={style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ expanded: open, disabled }}
        disabled={disabled}
        style={triggerStyle}
        onPress={() => change(true)}
      >
        <Text style={triggerTextStyle}>{text}</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => change(false)}>
        {/*
          Hidden from the accessibility tree rather than merely transparent.
          A backdrop that a screen reader can reach is a large unlabelled
          element between the user and the grid they opened.
        */}
        <Pressable
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ flex: 1 }}
          onPress={() => change(false)}
        />
        <View
          accessibilityViewIsModal
          accessibilityRole="none"
          accessibilityLabel={dialogLabel}
          style={dialogStyle}
        >
          <HozoCalendar
            className={calendarClassName}
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
          <Pressable accessibilityRole="button" style={doneStyle} onPress={() => change(false)}>
            <Text style={doneTextStyle}>{doneLabel}</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  )
}

export {
  type HozoDateTimeHalf as DateTimeHalf,
  HozoDateTimePicker as DateTimePicker,
  type HozoDateTimePickerProps as DateTimePickerProps,
}
