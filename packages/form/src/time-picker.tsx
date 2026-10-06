import { useHozoI18n, useHozoMessage } from '@hozo/behaviors'
import { type KeyboardEvent, useCallback, useState } from 'react'

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
  className?: string
  /** On the group holding a value and its two arrows; see `field` below. */
  fieldClassName?: string
  /**
   * On each `role="spinbutton"` itself.
   *
   * The element that takes focus and the element a pointer has to hit, and it
   * had nothing: `fieldClassName` dresses the group around it, so the value was
   * the width of its own digits. Measured in the Storybook catalogue by
   * `check-appearance.mjs` -- **9 by 20 pixels** for an hour reading "9",
   * against WCAG 2.5.8's 24 by 24 -- and an application could not fix it from
   * outside, which is the same reason `Calendar` has `monthButtonClassName`.
   *
   * It is also where a focus ring belongs. A ring on the group is a correct
   * indicator and the only one that was possible; one on the focused element is
   * what 2.4.11 describes.
   */
  valueClassName?: string
  periodClassName?: string
  /** On each arrow, so an application can place them and Hozo need not. */
  stepClassName?: string
  value?: CalendarTime | null
  onChange?: (time: CalendarTime) => void
  /** The time the fields start on while uncontrolled. */
  defaultValue?: CalendarTime
  min?: CalendarTime
  max?: CalendarTime
  /**
   * Minutes the minute field steps by. The hour field always steps an hour.
   *
   * Not applied to a typed value. A step of fifteen means the arrows move in
   * quarters, and it does not mean 09:07 is refused -- `isOnStep` is there
   * for a caller who wants to say so, and silently rounding what someone
   * typed is the kind of help that loses data.
   */
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
  /**
   * The period markers, which `Intl` would supply if it could be asked.
   *
   * `formatToParts` is what returns them localised, and whether Hermes has it
   * is the same unknown as `resolvedOptions` -- so they are words from the
   * caller with English defaults, like every other piece of chrome here.
   */
  periodLabels?: { am: string; pm: string }
  /**
   * What the arrows are called.
   *
   * The Native half has carried these since it had buttons and the Web did
   * not; now both do, and both name them the same way.
   */
  increaseLabel?: string
  decreaseLabel?: string
  /** What a field shows before anything is chosen. */
  emptyLabel?: string
}

/** Where an arrow press starts when nothing has been chosen yet. */
const MIDNIGHT: CalendarTime = { hour: 0, minute: 0 }

/**
 * Two spinbuttons and, on a twelve-hour clock, a period.
 *
 * `role="spinbutton"` on an editable field rather than a pair of arrows with
 * a read-only number beside them. ARIA's spinbutton is a field whose value
 * can be typed *and* stepped, which is what `<input type="time">` is, and a
 * stepper that can only be stepped is the version people find unusable --
 * twenty-nine presses to reach half past.
 *
 * The period is a `button` rather than a third spinbutton. A spinbutton
 * carries `aria-valuenow`, and a number for "am" is a number nobody can
 * read; two states with a name each is what a button is for. The arrows
 * still work on it, so the widget behaves the same way across all three.
 *
 * Each field's `aria-valuetext` is the *whole* time rather than its own
 * digits. A screen reader user moving the hour wants to hear where that put
 * the time, and "14" on its own is the one thing they already knew.
 */
export function HozoTimePicker({
  className,
  fieldClassName,
  valueClassName,
  periodClassName,
  stepClassName,
  value,
  onChange,
  defaultValue,
  min,
  max,
  step = 1,
  locale: localeProp,
  hour12,
  disabled,
  accessibilityLabel,
  hourFieldLabel: hourFieldLabelProp,
  minuteFieldLabel: minuteFieldLabelProp,
  periodFieldLabel: periodFieldLabelProp,
  periodLabels = { am: 'AM', pm: 'PM' },
  increaseLabel: increaseLabelProp,
  decreaseLabel: decreaseLabelProp,
  emptyLabel: emptyLabelProp,
}: HozoTimePickerProps) {
  // A string from the prop, then the project's i18n, then English;
  // `locale` the same way (decision 008).
  const message = useHozoMessage()
  const hozoI18n = useHozoI18n()
  const locale = localeProp ?? hozoI18n.locale
  const hourFieldLabel = message('hozo.timePicker.hour', {}, hourFieldLabelProp)
  const minuteFieldLabel = message('hozo.timePicker.minute', {}, minuteFieldLabelProp)
  const periodFieldLabel = message('hozo.timePicker.period', {}, periodFieldLabelProp)
  const increaseLabel = message('hozo.timePicker.increase', {}, increaseLabelProp)
  const decreaseLabel = message('hozo.timePicker.decrease', {}, decreaseLabelProp)
  const emptyLabel = message('hozo.timePicker.empty', {}, emptyLabelProp)
  const [own, setOwn] = useState<CalendarTime | null>(defaultValue ?? null)
  const controlled = value !== undefined
  const current = controlled ? value : own
  const twelve = hour12 ?? usesTwelveHour(locale)

  /**
   * What is being typed, and into which field.
   *
   * Two digits at most, and only while that field has focus. A field with a
   * buffer shows the buffer, so someone typing "1" towards "12" sees "1"
   * rather than the value jumping to one o'clock and back.
   */
  const [typed, setTyped] = useState<{ field: 'hour' | 'minute'; text: string } | null>(null)

  const commit = useCallback(
    (next: CalendarTime) => {
      if (!isWithinTime(next, { min, max })) return
      if (!controlled) setOwn(next)
      onChange?.(next)
    },
    [controlled, max, min, onChange],
  )

  // Stepping an unset picker starts somewhere rather than doing nothing, and
  // the lowest allowed time is the one place that cannot be wrong.
  const from = current ?? min ?? MIDNIGHT

  const stepBy = (field: 'hour' | 'minute' | 'period', direction: 1 | -1) => {
    setTyped(null)
    if (current === null) {
      commit(from)
      return
    }
    if (field === 'hour') commit(addHours(current, direction))
    else if (field === 'minute') commit(addMinutes(current, direction * Math.max(1, step)))
    else commit(withPeriod(current, twelveHour(current).period === 'am' ? 'pm' : 'am'))
  }

  const typeDigit = (field: 'hour' | 'minute', digit: string) => {
    const text = ((typed?.field === field ? typed.text : '') + digit).slice(-2)
    setTyped({ field, text })
    const entered = Number(text)
    if (!Number.isInteger(entered)) return
    const base = current ?? from
    if (field === 'hour') {
      // A twelve-hour field speaks 1-12 and the value holds 0-23, so the
      // period it is already in decides which hour the digits mean: 3 typed
      // in the afternoon is 15, and the period button is what moves it.
      let hour = entered
      if (twelve) {
        const afternoon = twelveHour(base).period === 'pm'
        hour = afternoon ? (entered % 12) + 12 : entered % 12
      }
      const inRange = twelve ? entered >= 1 && entered <= 12 : entered <= 23
      if (inRange) commit({ ...base, hour })
      return
    }
    if (entered <= 59) commit({ ...base, minute: entered })
  }

  const onFieldKeyDown =
    (field: 'hour' | 'minute' | 'period') => (event: KeyboardEvent<HTMLElement>) => {
      if (disabled) return
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault()
        stepBy(field, event.key === 'ArrowUp' ? 1 : -1)
        return
      }
      if (field === 'period') {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          stepBy(field, 1)
        }
        return
      }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault()
        setTyped(null)
        return
      }
      if (/^[0-9]$/.test(event.key)) {
        event.preventDefault()
        typeDigit(field, event.key)
      }
    }

  const spoken = current === null ? emptyLabel : timeLabel(current, locale, { hour12: twelve })

  const textOf = (name: 'hour' | 'minute') => {
    if (typed?.field === name) return typed.text
    if (current === null) return emptyLabel
    if (name === 'minute') return minuteLabel(current, locale)
    return hourLabel(current, locale, { hour12: twelve })
  }

  const hourNow = () => {
    if (current === null) return undefined
    return twelve ? twelveHour(current).hour : current.hour
  }

  const periodText = () => {
    if (current === null) return emptyLabel
    return twelveHour(current).period === 'am' ? periodLabels.am : periodLabels.pm
  }

  /**
   * One of a field's two arrows.
   *
   * `tabIndex={-1}`, which is the point of having them. The field owns the
   * arrow keys, so putting these in the tab order would make each field three
   * stops where it is one, for two controls that do what Up and Down already
   * do. A pointer gains something; the keyboard path is untouched.
   *
   * Still in the accessibility tree, and still named, because a screen reader
   * reaching one by browsing should know what it is. The Native half's pair
   * are ordinary focusable buttons: there is no tab order there to lengthen.
   */
  const arrow = (name: 'hour' | 'minute', direction: 1 | -1, glyph: string) => (
    <button
      type="button"
      tabIndex={-1}
      aria-label={`${direction === 1 ? increaseLabel : decreaseLabel} ${
        name === 'hour' ? hourFieldLabel : minuteFieldLabel
      }`}
      disabled={disabled}
      // The styling hook beside the attribute, because Hozo compiles
      // `disabled:` to `[data-hozo-disabled]` rather than to `:disabled`
      // (decision 001). The spinbutton below has carried it from the start;
      // these two did not, so a `disabled:` class on an arrow was CSS that
      // could never match.
      data-hozo-disabled={disabled ? '' : undefined}
      className={stepClassName}
      data-hozo-step={direction === 1 ? 'increase' : 'decrease'}
      onClick={() => stepBy(name, direction)}
    >
      {glyph}
    </button>
  )

  /**
   * A field is a group holding its value and its two arrows.
   *
   * `fieldClassName` is on that group rather than on the spinbutton, which is
   * where the Native half puts `fieldStyle`, and the two halves keep the same
   * prop list. It is also the element an application styles: the arrows sit
   * inside its right edge or above and below it, and that is a stylesheet's
   * decision rather than Hozo's -- this package ships no CSS, and the order
   * here (up, value, down) is what lets one set of markup be laid out either
   * way.
   */
  const field = (
    name: 'hour' | 'minute',
    text: string,
    label: string,
    now: number | undefined,
    low: number,
    high: number,
  ) => (
    <div className={fieldClassName} data-hozo-field={name}>
      {arrow(name, 1, '▲')}
      <div
        role="spinbutton"
        className={valueClassName}
        aria-label={label}
        aria-valuenow={now}
        aria-valuemin={low}
        aria-valuemax={high}
        aria-valuetext={spoken}
        aria-disabled={disabled || undefined}
        data-hozo-disabled={disabled ? '' : undefined}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={onFieldKeyDown(name)}
        onBlur={() => setTyped(null)}
      >
        {text}
      </div>
      {arrow(name, -1, '▼')}
    </div>
  )

  return (
    <div role="group" aria-label={accessibilityLabel} className={className}>
      {field('hour', textOf('hour'), hourFieldLabel, hourNow(), twelve ? 1 : 0, twelve ? 12 : 23)}
      {field('minute', textOf('minute'), minuteFieldLabel, current?.minute, 0, 59)}
      {twelve ? (
        <button
          type="button"
          aria-label={periodFieldLabel}
          disabled={disabled}
          // The same hook the arrows and the spinbutton carry; see `arrow`.
          data-hozo-disabled={disabled ? '' : undefined}
          className={periodClassName}
          onClick={() => stepBy('period', 1)}
          onKeyDown={onFieldKeyDown('period')}
        >
          {periodText()}
        </button>
      ) : null}
    </div>
  )
}

export { HozoTimePicker as TimePicker, type HozoTimePickerProps as TimePickerProps }
