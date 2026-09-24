import { useCallback, useState } from 'react'
import { Pressable, type StyleProp, Text, type TextStyle, View, type ViewStyle } from 'react-native'

import { hourLabel, minuteLabel, timeLabel, usesTwelveHour } from './time-format.ts'
import {
  addHours,
  addMinutes,
  type CalendarTime,
  isWithinTime,
  twelveHour,
  withPeriod,
} from './time-rules.ts'

export interface HozoTimePickerProps {
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
  fieldClassName?: string
  periodClassName?: string
  style?: StyleProp<ViewStyle>
  fieldStyle?: StyleProp<ViewStyle>
  fieldTextStyle?: StyleProp<TextStyle>
  stepStyle?: StyleProp<ViewStyle>
  value?: CalendarTime | null
  onChange?: (time: CalendarTime) => void
  /** The time the fields start on while uncontrolled. */
  defaultValue?: CalendarTime
  min?: CalendarTime
  max?: CalendarTime
  /** Minutes the minute field steps by. The hour field always steps an hour. */
  step?: number
  /** A BCP 47 tag for the digits and the period. */
  locale?: string
  /** Overrides what the locale implies; see `usesTwelveHour`. */
  hour12?: boolean
  disabled?: boolean
  /**
   * The chrome's words, because Hozo does not own a message catalogue.
   *
   * #157 leaves string extraction to `i18next` and its peers. The times
   * themselves come from `Intl` and need no dictionary.
   */
  accessibilityLabel?: string
  hourFieldLabel?: string
  minuteFieldLabel?: string
  periodFieldLabel?: string
  periodLabels?: { am: string; pm: string }
  /**
   * What the stepping controls are called.
   *
   * They exist only on this side. The Web half has no buttons because it has
   * arrow keys; here there is neither a keyboard nor a tab order, so each
   * field gets a pair -- and a pair of unlabelled chevrons is two elements a
   * screen reader calls "button".
   */
  increaseLabel?: string
  decreaseLabel?: string
  /** What a field shows before anything is chosen. */
  emptyLabel?: string
}

/** Where a step starts when nothing has been chosen yet. */
const MIDNIGHT: CalendarTime = { hour: 0, minute: 0 }

/**
 * The same two fields, stepped by buttons rather than by arrow keys.
 *
 * `accessibilityRole="spinbutton"` on each field, which React Native does
 * have -- it is in `ViewAccessibility`'s role union and reaches Android's
 * node info. What it cannot have is the typing: there is no editable field
 * here without a `TextInput`, and a `TextInput` per segment brings a keyboard
 * up over the control it is meant to be operating. So the value moves through
 * a pair of buttons per field, which is what a phone's own pickers do.
 *
 * Each field says the whole time through `accessibilityValue.text` rather
 * than its own digits, matching the Web half's `aria-valuetext`:
 * `BaseViewManager` joins the label and the value text with ", ", so TalkBack
 * reads "Hour, 9:30 AM" and the reader hears where the step landed.
 */
export function HozoTimePicker({
  style,
  fieldStyle,
  fieldTextStyle,
  stepStyle,
  value,
  onChange,
  defaultValue,
  min,
  max,
  step = 1,
  locale,
  hour12,
  disabled,
  accessibilityLabel,
  hourFieldLabel = 'Hour',
  minuteFieldLabel = 'Minute',
  periodFieldLabel = 'AM or PM',
  periodLabels = { am: 'AM', pm: 'PM' },
  increaseLabel = 'Increase',
  decreaseLabel = 'Decrease',
  emptyLabel = '--',
}: HozoTimePickerProps) {
  const [own, setOwn] = useState<CalendarTime | null>(defaultValue ?? null)
  const controlled = value !== undefined
  const current = controlled ? value : own
  const twelve = hour12 ?? usesTwelveHour(locale)

  const commit = useCallback(
    (next: CalendarTime) => {
      if (!isWithinTime(next, { min, max })) return
      if (!controlled) setOwn(next)
      onChange?.(next)
    },
    [controlled, max, min, onChange],
  )

  const from = current ?? min ?? MIDNIGHT

  const stepBy = (field: 'hour' | 'minute' | 'period', direction: 1 | -1) => {
    if (current === null) {
      commit(from)
      return
    }
    if (field === 'hour') commit(addHours(current, direction))
    else if (field === 'minute') commit(addMinutes(current, direction * Math.max(1, step)))
    else commit(withPeriod(current, twelveHour(current).period === 'am' ? 'pm' : 'am'))
  }

  const spoken = current === null ? emptyLabel : timeLabel(current, locale, { hour12: twelve })

  const textOf = (name: 'hour' | 'minute') => {
    if (current === null) return emptyLabel
    if (name === 'minute') return minuteLabel(current, locale)
    return hourLabel(current, locale, { hour12: twelve })
  }

  const periodText = () => {
    if (current === null) return emptyLabel
    return twelveHour(current).period === 'am' ? periodLabels.am : periodLabels.pm
  }

  const fieldName = (field: 'hour' | 'minute' | 'period'): string => {
    if (field === 'hour') return hourFieldLabel
    if (field === 'minute') return minuteFieldLabel
    return periodFieldLabel
  }

  const stepper = (field: 'hour' | 'minute' | 'period', direction: 1 | -1, glyph: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${direction === 1 ? increaseLabel : decreaseLabel} ${fieldName(field)}`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      style={stepStyle}
      onPress={() => stepBy(field, direction)}
    >
      <Text>{glyph}</Text>
    </Pressable>
  )

  const field = (name: 'hour' | 'minute', label: string) => (
    <View style={fieldStyle}>
      {stepper(name, 1, '▲')}
      <View
        accessibilityRole="spinbutton"
        accessibilityLabel={label}
        accessibilityValue={{ text: spoken }}
        accessibilityState={{ disabled }}
      >
        <Text style={fieldTextStyle}>{textOf(name)}</Text>
      </View>
      {stepper(name, -1, '▼')}
    </View>
  )

  return (
    <View accessibilityRole="none" accessibilityLabel={accessibilityLabel} style={style}>
      {field('hour', hourFieldLabel)}
      {field('minute', minuteFieldLabel)}
      {twelve ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={periodFieldLabel}
          accessibilityValue={{ text: spoken }}
          accessibilityState={{ disabled }}
          disabled={disabled}
          style={fieldStyle}
          onPress={() => stepBy('period', 1)}
        >
          <Text style={fieldTextStyle}>{periodText()}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

export { HozoTimePicker as TimePicker, type HozoTimePickerProps as TimePickerProps }
