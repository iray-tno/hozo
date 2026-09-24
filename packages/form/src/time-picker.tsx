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
  /** On each `role="spinbutton"`, so a `disabled:` variant reaches them. */
  fieldClassName?: string
  periodClassName?: string
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
  periodClassName,
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
  emptyLabel = '--',
}: HozoTimePickerProps) {
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

  const field = (
    name: 'hour' | 'minute',
    text: string,
    label: string,
    now: number | undefined,
    low: number,
    high: number,
  ) => (
    <div
      role="spinbutton"
      aria-label={label}
      aria-valuenow={now}
      aria-valuemin={low}
      aria-valuemax={high}
      aria-valuetext={spoken}
      aria-disabled={disabled || undefined}
      data-hozo-disabled={disabled ? '' : undefined}
      tabIndex={disabled ? -1 : 0}
      className={fieldClassName}
      onKeyDown={onFieldKeyDown(name)}
      onBlur={() => setTyped(null)}
    >
      {text}
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
