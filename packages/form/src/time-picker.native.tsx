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
 * The two actions a `SeekBar` offers, which is what TalkBack turns into swipe
 * up and swipe down once the role is `adjustable`.
 *
 * A module constant rather than a fresh array per field per render: the prop
 * crosses the bridge, and two identical arrays rebuilt on every keystroke are
 * two messages that say nothing new.
 */
const INCREMENT_DECREMENT = [{ name: 'increment' }, { name: 'decrement' }] as const

/**
 * The same two fields, stepped by buttons rather than by arrow keys.
 *
 * `accessibilityRole="adjustable"` on each field, which is Android's nearest
 * thing to the Web half's `role="spinbutton"`: the node becomes a `SeekBar`,
 * so TalkBack announces it as a range and offers swipe up and swipe down
 * against `accessibilityActions`. What no role here can have is the typing --
 * there is no editable field without a `TextInput`, and a `TextInput` per
 * segment brings a keyboard up over the control it is meant to be operating.
 * So the value also moves through a pair of buttons per field, which is what
 * a phone's own pickers do and what a reader has if the gestures do not
 * arrive.
 *
 * Each field says the whole time through `accessibilityValue.text` rather
 * than its own digits, matching the Web half's `aria-valuetext`:
 * `BaseViewManager` joins the label and the value text with ", ", so TalkBack
 * reads "Hour, 9:30 AM" and the reader hears where the step landed.
 *
 * All of which was already written here and none of which was happening. The
 * fields carried the role, the label and the value and were not accessibility
 * elements at all, because a `View` is only one when it says `accessible` --
 * see the comment at that prop for what the device found.
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

  /**
   * The range the swipe gestures move within.
   *
   * `now` is left out when nothing is chosen: a range with no current value is
   * what an empty field is, and inventing one -- midnight, or the minimum --
   * would announce a time the picker does not hold.
   */
  const rangeOf = (name: 'hour' | 'minute') => {
    const low = name === 'minute' ? 0 : twelve ? 1 : 0
    const high = name === 'minute' ? 59 : twelve ? 12 : 23
    if (current === null) return { max: high, min: low }
    const now =
      name === 'minute' ? current.minute : twelve ? twelveHour(current).hour : current.hour
    return { max: high, min: low, now }
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
        // The line this whole control turned on, and it was missing.
        //
        // A `View` is not an accessibility element unless it says so: without
        // `accessible`, the role, the label and the value below it reached
        // nobody. Measured on an API 36 emulator -- TalkBack's walk of this
        // screen was seven items, the four steppers, the period and the two
        // triggers, and the fields were on it nowhere. `android-smoke.sh`
        // listed "9" and "30" among the nodes that are *drawn and
        // undescribed*, which is what a `Text` inside an inert `View` is. So a
        // reader could press Increase Hour and had no way to hear the hour.
        accessible
        // `adjustable` rather than `spinbutton`, which was here and is not
        // what failed. Android has no spinbutton; `adjustable` is the role
        // that becomes a `SeekBar` in the node info, which is what makes
        // TalkBack offer swipe up and down -- so the value becomes reachable
        // *and* adjustable from where it is announced, instead of only from
        // two buttons beside it. The Web half's `role="spinbutton"` is the
        // same idea in the vocabulary that has one.
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        // `text` is what TalkBack reads, and it is the whole time rather than
        // this field's digits -- the Web half's `aria-valuetext`, for its
        // reason: a reader moving the hour wants to hear where that put the
        // time. `min`, `max` and `now` are underneath it so the node is a
        // range rather than a label with a number in it, which is what the
        // swipe gestures act on.
        accessibilityValue={{ ...rangeOf(name), text: spoken }}
        accessibilityActions={INCREMENT_DECREMENT}
        onAccessibilityAction={({ nativeEvent }) => {
          if (disabled) return
          if (nativeEvent.actionName === 'increment') stepBy(name, 1)
          else if (nativeEvent.actionName === 'decrement') stepBy(name, -1)
        }}
        accessibilityState={{ disabled }}
      >
        <Text style={fieldTextStyle}>{textOf(name)}</Text>
      </View>
      {/*
        The steppers stay on the walk rather than being hidden behind the
        gestures they duplicate. Whether `adjustable`'s swipes arrive at all is
        not established on this platform, and hiding the only other way to
        change the value on the strength of an untested one would trade a
        control a reader cannot hear for a control it cannot reach.
      */}
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
