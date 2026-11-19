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
import { dayLabel } from './calendar-format.ts'
import type { CalendarDate, CalendarMonth, Weekday } from './calendar-rules.ts'
import { resolveDatePickerFrame } from './date-picker-frame.native.ts'
import type {
  CalendarDayClassFacts,
  FormButtonClassFacts,
  PickerButtonClassFacts,
} from './owner-facts.native.ts'
import { PickerButton } from './picker-button.native.tsx'

export interface HozoDatePickerProps {
  /**
   * Tailwind classes, the same prop the Web half takes.
   *
   * Each owner resolves through the existing project candidate map with its
   * own facts. Wrapper/dialog text reaches owned labels below their own styles;
   * custom renderDay elements remain caller-owned. Calendar slots are forwarded.
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
  /** @internal Complete prepared root class contribution (RFC 010). */
  hozoDatePickerStyle?: () => StyleProp<ViewStyle | TextStyle>
  /** @internal Complete prepared trigger class contribution (RFC 010). */
  hozoTriggerStyle?: (state: PickerButtonClassFacts) => StyleProp<ViewStyle | TextStyle>
  /** @internal Complete prepared dialog class contribution (RFC 010). */
  hozoDialogStyle?: () => StyleProp<ViewStyle | TextStyle>
  /** @internal Complete prepared calendar root class contribution (RFC 010). */
  hozoCalendarStyle?: () => StyleProp<ViewStyle | TextStyle>
  /** @internal Complete prepared calendar header class contribution (RFC 010). */
  hozoHeaderStyle?: () => StyleProp<ViewStyle | TextStyle>
  /** @internal Complete prepared calendar grid class contribution (RFC 010). */
  hozoGridStyle?: () => StyleProp<ViewStyle | TextStyle>
  /** @internal Complete prepared calendar month button class contribution (RFC 010). */
  hozoMonthButtonStyle?: (state: FormButtonClassFacts) => StyleProp<ViewStyle | TextStyle>
  /** @internal Complete prepared calendar day cell class contribution (RFC 010). */
  hozoDayStyle?: (state: CalendarDayClassFacts) => StyleProp<ViewStyle | TextStyle>
  style?: StyleProp<ViewStyle>
  triggerStyle?: StyleProp<ViewStyle>
  triggerTextStyle?: StyleProp<TextStyle>
  dialogStyle?: StyleProp<ViewStyle>
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
   * a design decision rather than an accessibility one -- whatever it returns
   * is what is spoken, as the button's name when no `accessibilityLabel` was
   * given and as its `accessibilityValue` when one was.
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
 * A button that opens a `Calendar` in a modal.
 *
 * `Modal` rather than the `FloatingPositioner` the Web half anchors with,
 * because the two platforms disagree about what a picker is: on a phone a
 * date grid anchored to a button would be most of the screen anyway, and
 * React Native's own `Modal` is what takes over the window, sends Android's
 * back button to `onRequestClose`, and lets `accessibilityViewIsModal` tell
 * VoiceOver to stop offering what is behind it.
 *
 * There is no focus trap and no focus restoration here, and neither is an
 * omission: `accessibilityViewIsModal` and the hidden backdrop are how the
 * same guarantee is spelled on this platform, and there is no tab order to
 * trap in the first place.
 */
export function HozoDatePicker({
  className,
  dialogClassName,
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
  hozoDatePickerStyle,
  hozoTriggerStyle,
  hozoDialogStyle,
  hozoCalendarStyle,
  hozoHeaderStyle,
  hozoGridStyle,
  hozoMonthButtonStyle,
  hozoDayStyle,
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
  formatValue = dayLabel,
  placeholder = 'Select a date',
  dialogLabel: dialogLabelProp,
  previousMonthLabel,
  nextMonthLabel,
  todayLabel,
  accessibilityLabel,
  renderDay,
}: HozoDatePickerProps) {
  if (hozoDatePickerStyle && className !== undefined)
    throw new Error('Prepared DatePicker styles must consume className')
  if (hozoTriggerStyle && triggerClassName !== undefined)
    throw new Error('Prepared DatePicker styles must consume triggerClassName')
  if (hozoDialogStyle && dialogClassName !== undefined)
    throw new Error('Prepared DatePicker styles must consume dialogClassName')
  if (hozoCalendarStyle && calendarClassName !== undefined)
    throw new Error('Prepared DatePicker styles must consume calendarClassName')
  if (hozoHeaderStyle && headerClassName !== undefined)
    throw new Error('Prepared DatePicker styles must consume headerClassName')
  if (hozoGridStyle && gridClassName !== undefined)
    throw new Error('Prepared DatePicker styles must consume gridClassName')
  if (hozoMonthButtonStyle && monthButtonClassName !== undefined)
    throw new Error('Prepared DatePicker styles must consume monthButtonClassName')
  if (hozoDayStyle && dayClassName !== undefined)
    throw new Error('Prepared DatePicker styles must consume dayClassName')
  // A string from the prop, then the project's i18n, then English;
  // `locale` the same way (decision 008).
  const message = useHozoMessage()
  const hozoI18n = useHozoI18n()
  const locale = localeProp ?? hozoI18n.locale
  const dialogLabel = message('hozo.datePicker.dialog', {}, dialogLabelProp)
  const [open, setOpen] = useState(defaultOpen)

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

  const text = value ? formatValue(value, locale) : placeholder
  const frame = resolveDatePickerFrame({
    className,
    hozoRootStyle: hozoDatePickerStyle,
    style,
    dialogClassName,
    hozoDialogStyle,
    dialogStyle,
    open,
  })

  return (
    <View style={frame.box}>
      <PickerButton
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
        inheritedTextStyle={frame.text}
        className={triggerClassName}
        hozoButtonStyle={hozoTriggerStyle}
        onPress={() => change(true)}
      >
        {text}
      </PickerButton>
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
          style={frame.dialogBox}
        >
          <HozoCalendar
            hozoInheritedTextStyle={frame.contentText}
            className={calendarClassName}
            headerClassName={headerClassName}
            gridClassName={gridClassName}
            monthButtonClassName={monthButtonClassName}
            dayClassName={dayClassName}
            hozoCalendarStyle={hozoCalendarStyle}
            hozoHeaderStyle={hozoHeaderStyle}
            hozoGridStyle={hozoGridStyle}
            hozoMonthButtonStyle={hozoMonthButtonStyle}
            hozoDayStyle={hozoDayStyle}
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
        </View>
      </Modal>
    </View>
  )
}

export { HozoDatePicker as DatePicker, type HozoDatePickerProps as DatePickerProps }
