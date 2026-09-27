import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { HozoDatePicker, type HozoDatePickerProps } from './date-picker.tsx'

const date = (year: number, month: number, day: number) => ({ year, month, day })

const defaults: HozoDatePickerProps = {
  today: date(2026, 9, 24),
  defaultMonth: { year: 2026, month: 9 },
  locale: 'en-US',
  firstDayOfWeek: 1,
}

const render = (props: Partial<HozoDatePickerProps> = {}) =>
  renderToStaticMarkup(createElement(HozoDatePicker, { ...defaults, ...props }))

function attributes(html: string, name: string): string[] {
  return [...html.matchAll(new RegExp(`${name}="([^"]*)"`, 'g'))].map((match) => match[1] ?? '')
}

const count = (html: string, needle: string) => html.split(needle).length - 1

test('closed, it is a button that says it opens a dialog', () => {
  const html = render()
  assert.match(html, /aria-haspopup="dialog"/)
  assert.match(html, /aria-expanded="false"/)
  assert.doesNotMatch(html, /role="dialog"/)
  assert.doesNotMatch(html, /aria-controls=/, 'nothing to point at while the dialog does not exist')
})

test('open, the button points at the dialog and the dialog says it is one', () => {
  const html = render({ defaultOpen: true })
  assert.match(html, /aria-expanded="true"/)
  assert.match(html, /role="dialog"/)
  assert.match(html, /aria-modal="true"/)
  const [controls] = attributes(html, 'aria-controls')
  // The dialog's own id comes first: the calendar's month heading is the
  // only other element with one, and it is rendered inside this.
  const [dialogId] = attributes(html, 'id')
  assert.ok(dialogId, 'the dialog has an id')
  assert.equal(controls, dialogId)
})

test('the dialog is named, and holds the grid', () => {
  const html = render({ defaultOpen: true })
  assert.match(html, /aria-label="Choose a date"/)
  assert.match(html, /role="grid"/)
  assert.equal(count(html, 'role="gridcell"'), 42)
})

test('a caller can name the dialog something else', () => {
  assert.match(render({ defaultOpen: true, dialogLabel: 'Departure' }), /aria-label="Departure"/)
})

test('the button reads as the placeholder until a date is chosen', () => {
  assert.match(render(), />Select a date</)
  assert.match(render({ placeholder: 'Pick one' }), />Pick one</)
})

test('once chosen, the button reads as the date, at whatever length was asked for', () => {
  const chosen = { value: date(2026, 9, 24) }
  assert.match(render(chosen), />Thursday, September 24, 2026</, 'the long form by default')
  const short = render({
    ...chosen,
    formatValue: (at) => `${at.year}-${at.month}-${at.day}`,
  })
  assert.match(short, />2026-9-24</)
})

test('a named button says what the date is for and what the date is', () => {
  const html = render({ value: date(2026, 9, 24), accessibilityLabel: 'Departure date' })
  // Both, from `aria-labelledby`, because a button has one name and no value.
  // `aria-label` alone made the name the purpose and left the date as content,
  // which NVDA reads and VoiceOver on Safari does not -- so a VoiceOver user
  // could not hear which date was selected. The Native halves close the same
  // hole with `accessibilityValue`.
  const [name] = attributes(html, 'aria-labelledby')
  assert.ok(name, 'the button is named by reference')
  const [purpose, value] = (name ?? '').split(' ')
  assert.match(html, new RegExp(`<span id="${purpose}" hidden="">Departure date</span>`))
  assert.match(html, new RegExp(`<span id="${value}">Thursday, September 24, 2026</span>`))
  assert.doesNotMatch(html, /aria-label="Departure date"/, 'the label is not also an attribute')
})

test('an unnamed button is unchanged, down to the markup', () => {
  // The name is its text, so nothing is referenced and no span is added. Worth
  // asserting rather than assuming: the ids would otherwise be the first in the
  // document and the dialog would no longer own the first one.
  const html = render({ value: date(2026, 9, 24) })
  assert.doesNotMatch(html, /aria-labelledby/)
  assert.doesNotMatch(html, /<span/)
  assert.match(html, />Thursday, September 24, 2026</)
})

test('a disabled picker is a disabled button, and opens nothing', () => {
  const html = render({ disabled: true })
  assert.match(html, /<button[^>]*\sdisabled=""/)
  assert.doesNotMatch(html, /role="dialog"/)
})

test('the grid inside is the one that was configured', () => {
  // The picker forwards what it was given rather than keeping a second set
  // of defaults that could drift from the grid's.
  const html = render({ defaultOpen: true, value: date(2026, 9, 10) })
  assert.equal(attributes(html, 'aria-selected').filter((value) => value === 'true').length, 1)
  assert.equal(count(html, 'aria-current="date"'), 1)
  assert.match(html, /September 2026/)
})

test('the picker forwards a controlled month to the grid', () => {
  const html = render({ defaultOpen: true, month: { year: 2027, month: 2 } })
  assert.match(html, /February 2027/)
})
