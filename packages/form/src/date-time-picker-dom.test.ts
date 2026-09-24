import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { HozoDateTimePicker, type HozoDateTimePickerProps } from './date-time-picker.tsx'
import type { CalendarDateTime } from './date-time-rules.ts'

const at = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): CalendarDateTime => ({ year, month, day, hour, minute })

/**
 * September 2026, pinned.
 *
 * `today` is a prop for exactly this: the grid marks a day with
 * `aria-current`, and a suite that let the real clock decide which one would
 * pass or fail depending on the day it ran on.
 */
const defaults: HozoDateTimePickerProps = {
  today: { year: 2026, month: 9, day: 24 },
  defaultMonth: { year: 2026, month: 9 },
  locale: 'en-US',
  hour12: true,
  firstDayOfWeek: 1,
}

const render = (props: Partial<HozoDateTimePickerProps> = {}) =>
  renderToStaticMarkup(createElement(HozoDateTimePicker, { ...defaults, ...props }))

function attributes(html: string, name: string): string[] {
  return [...html.matchAll(new RegExp(`${name}="([^"]*)"`, 'g'))].map((match) => match[1] ?? '')
}

const count = (html: string, needle: string) => html.split(needle).length - 1

/** A cell's opening tag, found by the accessible name it carries. */
function cellFor(html: string, label: string): string {
  const chunk = html.split('<td').find((part) => part.includes(`aria-label="${label}"`))
  assert.ok(chunk, `no cell named ${label}`)
  return chunk.slice(0, chunk.indexOf('>'))
}

test('closed, it is a button that says it opens a dialog', () => {
  const html = render()
  assert.match(html, /aria-haspopup="dialog"/)
  assert.match(html, /aria-expanded="false"/)
  assert.doesNotMatch(html, /role="dialog"/)
  assert.doesNotMatch(html, /aria-controls=/, 'nothing to point at while the dialog does not exist')
})

test('the button says the whole value, date and time in one sentence', () => {
  const html = render({ value: at(2026, 9, 24, 9, 30) })
  assert.match(html, />Thursday, September 24, 2026[^<]*9:30[^<]*AM</)
})

test('with no value the button says the placeholder, and the caller owns the words', () => {
  assert.match(render(), />Select a date and time</)
  assert.match(render({ placeholder: '日時を選択' }), />日時を選択</)
})

test('formatValue owns the text, which is also the name the button is given', () => {
  const html = render({
    value: at(2026, 9, 24, 9, 30),
    formatValue: (value) => `${value.year}-${value.month}-${value.day} ${value.hour}`,
  })
  assert.match(html, />2026-9-24 9</)
  assert.doesNotMatch(html, /September/, 'the long form is a default, not a floor')
})

test('open, it is one dialog holding the grid, a clock and a way out', () => {
  const html = render({ defaultOpen: true })
  assert.match(html, /aria-expanded="true"/)
  assert.match(html, /role="dialog"/)
  assert.match(html, /aria-modal="true"/)
  assert.match(html, /role="grid"/)
  assert.equal(count(html, 'role="spinbutton"'), 2, 'the hour and the minute')
  assert.match(html, />Done</)
  const [controls] = attributes(html, 'aria-controls')
  const [dialogId] = attributes(html, 'id')
  assert.equal(controls, dialogId, 'the button points at the dialog it opened')
})

test('Done is the way out because choosing a day cannot be', () => {
  // `DatePicker` closes on a day press; here the clock has not been touched
  // yet when that happens, so the dialog stays and carries a real control.
  assert.match(render({ defaultOpen: true, doneLabel: '完了' }), />完了</)
})

test('the grid is bounded by the day, not by the hour the bound names', () => {
  const html = render({ defaultOpen: true, min: at(2026, 9, 24, 9, 0) })
  // The afternoon of the 24th is allowed, so a greyed-out 24th would lie.
  assert.doesNotMatch(cellFor(html, 'Thursday, September 24, 2026'), /aria-disabled/)
  assert.match(cellFor(html, 'Wednesday, September 23, 2026'), /aria-disabled="true"/)
})

test('the clock is bounded only on the day the bound names', () => {
  const seen: string[] = []
  const probe = (props: Partial<HozoDateTimePickerProps>) =>
    render({
      ...props,
      defaultOpen: true,
      min: at(2026, 9, 24, 9, 0),
      max: at(2026, 9, 26, 17, 0),
      children: (time) => {
        seen.push(`${time.min ? time.min.hour : '-'}..${time.max ? time.max.hour : '-'}`)
        return null
      },
    })
  probe({ value: at(2026, 9, 24, 10, 0) })
  probe({ value: at(2026, 9, 25, 10, 0) })
  probe({ value: at(2026, 9, 26, 10, 0) })
  assert.deepEqual(seen, ['9..-', '-..-', '-..17'])
})

test('the time half is replaced by children, not added to', () => {
  const html = render({
    defaultOpen: true,
    value: at(2026, 9, 24, 9, 30),
    children: (time) =>
      createElement('p', {
        'data-value': time.value ? `${time.value.hour}:${time.value.minute}` : 'none',
        'data-hour12': String(time.hour12),
        'data-locale': time.locale,
      }),
  })
  assert.match(html, /data-value="9:30"/)
  assert.match(html, /data-hour12="true"/, 'what the trigger text reads by is what the half gets')
  assert.match(html, /data-locale="en-US"/)
  assert.equal(count(html, 'role="spinbutton"'), 0, 'the default clock is gone')
})

test('with no value the time half is empty rather than guessing an hour', () => {
  const html = render({
    defaultOpen: true,
    children: (time) => createElement('p', { 'data-value': time.value === null ? 'none' : 'some' }),
  })
  assert.match(html, /data-value="none"/)
})

test('disabled reaches the trigger and the half behind it', () => {
  const html = render({
    disabled: true,
    defaultOpen: true,
    children: (time) => createElement('p', { 'data-disabled': String(time.disabled) }),
  })
  assert.match(html, /<button[^>]*disabled=""/)
  assert.match(html, /data-disabled="true"/)
})
