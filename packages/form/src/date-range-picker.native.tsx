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
import { rangeLabel } from './calendar-format.ts'
import type { CalendarDate, CalendarMonth, CalendarRange, Weekday } from './calendar-rules.ts'

export interface HozoDateRangePickerProps {
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
  style?: StyleProp<ViewStyle>
  triggerStyle?: StyleProp<ViewStyle>
  triggerTextStyle?: StyleProp<TextStyle>
  dialogStyle?: StyleProp<ViewStyle>
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
 * A button that opens a range `Calendar` in a modal.
 *
 * `Modal` rather than an anchored panel, for the reason `DatePicker`'s Native
 * half gives: React Native's own `Modal` is what takes over the window, sends
 * Android's back button to `onRequestClose`, and lets
 * `accessibilityViewIsModal` tell VoiceOver to stop offering what is behind
 * it. There is no focus trap and none is owed -- there is no tab order here
 * to trap in the first place.
 *
 * It closes when the range arrives, and needs no Done button to do so: a
 * range `Calendar` reports only a range with both ends, so the press that
 * fires `onChange` is the press that finished the job. `DateTimePicker`'s two
 * halves complete independently, which is why that one has to ask.
 */
export function HozoDateRangePicker({
  style,
  triggerStyle,
  triggerTextStyle,
  dialogStyle,
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
  const [open, setOpen] = useState(defaultOpen)

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
            range
            className={calendarClassName}
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
        </View>
      </Modal>
    </View>
  )
}

export {
  HozoDateRangePicker as DateRangePicker,
  type HozoDateRangePickerProps as DateRangePickerProps,
}
