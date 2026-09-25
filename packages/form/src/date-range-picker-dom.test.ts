import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { rangeLabel } from './calendar-format.ts'
import { HozoDateRangePicker, type HozoDateRangePickerProps } from './date-range-picker.tsx'

const date = (year: number, month: number, day: number) => ({ year, month, day })

/**
 * September 2026, pinned.
 *
 * `today` is a prop for exactly this: the grid marks a day with
 * `aria-current`, and a suite that let the real clock decide which one would
 * pass or fail depending on the day it ran on.
 */
const defaults: HozoDateRangePickerProps = {
  today: date(2026, 9, 24),
  defaultMonth: { year: 2026, month: 9 },
  locale: 'en-US',
  firstDayOfWeek: 1,
}

const render = (props: Partial<HozoDateRangePickerProps> = {}) =>
  renderToStaticMarkup(createElement(HozoDateRangePicker, { ...defaults, ...props }))

const stay = { start: date(2026, 9, 10), end: date(2026, 9, 12) }

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

test('the button says both ends, and the placeholder when there are none', () => {
  const html = render({ value: stay })
  // Whatever `Intl` made of the pair is what the button says and what a
  // screen reader reads, so the assertion is that they are the same string.
  assert.ok(html.includes(`>${rangeLabel(stay, 'en-US')}<`))
  assert.match(render(), />Select dates</)
  assert.match(render({ placeholder: '期間を選択' }), />期間を選択</)
})

test('formatValue owns the text, which is also the name the button is given', () => {
  const html = render({
    value: stay,
    formatValue: (range) => `${range.start.day}-${range.end.day}`,
  })
  assert.match(html, />10-12</)
  assert.doesNotMatch(html, /September/, 'the long form is a default, not a floor')
})

test('open, the dialog holds a grid that says it selects more than one day', () => {
  const html = render({ defaultOpen: true, value: stay })
  assert.match(html, /aria-expanded="true"/)
  assert.match(html, /role="dialog"/)
  assert.match(html, /aria-modal="true"/)
  assert.match(html, /aria-multiselectable="true"/)
  const [controls] = attributes(html, 'aria-controls')
  const [dialogId] = attributes(html, 'id')
  assert.equal(controls, dialogId, 'the button points at the dialog it opened')
})

test('there is no Done button, because the grid says when it is finished', () => {
  const html = render({ defaultOpen: true })
  // `DateTimePicker` needs one: its two halves complete independently. A
  // range `Calendar` reports only a range with both ends, so the press that
  // fires `onChange` is the press that finished the job.
  assert.doesNotMatch(html, />Done</)
})

test('the whole range arrives in the grid, ends and middle', () => {
  const html = render({ defaultOpen: true, value: stay })
  assert.equal(attributes(html, 'aria-selected').filter((one) => one === 'true').length, 3)
  assert.equal(count(html, 'data-hozo-range-start=""'), 1)
  assert.equal(count(html, 'data-hozo-range-end=""'), 1)
  assert.equal(count(html, 'data-hozo-in-range=""'), 1, 'the 11th, and nothing else')
})

test('the words for the ends pass through to the cells', () => {
  const html = render({
    defaultOpen: true,
    value: stay,
    rangeStartLabel: 'from',
    rangeEndLabel: 'to',
  })
  assert.match(html, /September 10, 2026, from"/)
  assert.match(html, /September 12, 2026, to"/)
})

test('bounds reach the grid', () => {
  const html = render({ defaultOpen: true, min: date(2026, 9, 10) })
  const before = html.split('<td').find((part) => part.includes('September 9, 2026'))
  assert.ok(before?.slice(0, before.indexOf('>')).includes('aria-disabled="true"'))
})

test('disabled closes the button rather than the dialog', () => {
  assert.match(render({ disabled: true }), /<button[^>]*disabled=""/)
})

test('Intl writes the range as one phrase, collapsing what the ends share', () => {
  const written = rangeLabel(stay, 'en-US')
  assert.match(written, /10/)
  assert.match(written, /12/)
  assert.match(written, /2026/)
  // The month and the year are said once, which is the whole reason
  // `formatRange` is asked rather than two labels being joined.
  assert.equal(count(written, 'September'), 1)
  assert.equal(count(written, '2026'), 1)
})

test('without formatRange it prints both dates in full, joined by a caller word', () => {
  // The Hermes path, which this suite cannot reach by running on a phone.
  // `formatRange` is an ES2021 addition and only the three constructors are
  // established there, so the fallback is exercised by taking it away.
  const proto = Intl.DateTimeFormat.prototype as { formatRange?: unknown }
  const saved = proto.formatRange
  proto.formatRange = undefined
  try {
    assert.equal(count(rangeLabel(stay, 'en-US'), 'September'), 2)
    assert.match(rangeLabel(stay, 'en-US'), / - /, 'the documented default')
    assert.match(rangeLabel(stay, 'ja-JP', { separator: '〜' }), /〜/)
  } finally {
    proto.formatRange = saved
  }
})
