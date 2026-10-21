import { useHozoI18n, useHozoMessage } from '@hozo/behaviors'
import { type ReactNode, useCallback, useState } from 'react'
import {
  Modal,
  Pressable,
  type StyleProp,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native'

import { HozoCalendar, type HozoCalendarDay } from './calendar.native.tsx'
import { rangeLabel } from './calendar-format.ts'
import type { CalendarDate, CalendarMonth, CalendarRange, Weekday } from './calendar-rules.ts'
import { DatePickerTrigger } from './date-picker-trigger.native.tsx'

export interface HozoDateRangePickerProps {
  /**
   * Tailwind classes, the same prop the Web half takes.
   *
   * Wrapper/dialog classes remain unapplied here. Trigger classes resolve
   * through the existing project candidate map with that button's facts;
   * Calendar slots are passed to their own consumers, not resolved here.
   */
  className?: string
  triggerClassName?: string
  dialogClassName?: string
  calendarClassName?: string
  dayClassName?: string
  /** Forwarded to Calendar, which resolves each slot with its own owner facts. */
  headerClassName?: string
  gridClassName?: string
  monthButtonClassName?: string
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
   * whatever it returns is what is spoken, as the button's name when no
   * `accessibilityLabel` was given and as its `accessibilityValue` when one
   * was.
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
  triggerClassName,
  triggerStyle,
  triggerTextStyle,
  dialogStyle,
  calendarClassName,
  headerClassName,
  gridClassName,
  monthButtonClassName,
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
  locale: localeProp,
  firstDayOfWeek,
  today,
  weeks,
  disabled,
  formatValue,
  placeholder = 'Select dates',
  rangeSeparator,
  dialogLabel: dialogLabelProp,
  previousMonthLabel,
  nextMonthLabel,
  todayLabel,
  rangeStartLabel,
  rangeEndLabel,
  accessibilityLabel,
  renderDay,
}: HozoDateRangePickerProps) {
  // A string from the prop, then the project's i18n, then English;
  // `locale` the same way (decision 008).
  const message = useHozoMessage()
  const hozoI18n = useHozoI18n()
  const locale = localeProp ?? hozoI18n.locale
  const dialogLabel = message('hozo.dateRangePicker.dialog', {}, dialogLabelProp)
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
      <DatePickerTrigger
        accessibilityLabel={accessibilityLabel}
        // The chosen value, so a reader hears it and not only what the field is
        // for.
        //
        // Only when a name was given, and that is the whole of the bug. iOS
        // collapses the children of an accessible `Pressable`, so the `Text`
        // below is not in the accessibility tree: with `accessibilityLabel` set
        // the button's name is that label and the date is nowhere at all. A
        // VoiceOver user heard "Departure, button" and could not hear which date
        // was selected -- found on the first iOS reading of this screen, in the
        // tree printed by `AccessibilityTreeTests`.
        //
        // Android hid it. `TalkBack` reads the label and then the `Text` as the
        // button's contents, so the same markup announced the value there, and
        // the Android dump lists the date among the nodes that are *drawn and
        // undescribed* -- which is exactly the state that works on one platform
        // and disappears on the other.
        //
        // Left undefined when no label was given, because then the name already
        // *is* this text: `BaseViewManager` would join it to itself and iOS
        // would say it twice.
        accessibilityValue={accessibilityLabel ? { text } : undefined}
        expanded={open}
        disabled={disabled}
        style={triggerStyle}
        textStyle={triggerTextStyle}
        className={triggerClassName}
        onPress={() => change(true)}
      >
        {text}
      </DatePickerTrigger>
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
            headerClassName={headerClassName}
            gridClassName={gridClassName}
            monthButtonClassName={monthButtonClassName}
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
        </View>
      </Modal>
    </View>
  )
}

export {
  HozoDateRangePicker as DateRangePicker,
  type HozoDateRangePickerProps as DateRangePickerProps,
}
