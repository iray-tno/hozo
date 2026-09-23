import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { HozoCalendar, type HozoCalendarProps } from './calendar.tsx'

/**
 * Returned unannotated on purpose.
 *
 * A `CalendarDate` is three numbers, so the inferred type is already
 * assignable wherever one is wanted -- and importing the type would mean a
 * type-only import statement, which Biome sorts into its own place and which
 * `verbatimModuleSyntax` would leave as an empty runtime import.
 */
const date = (year: number, month: number, day: number) => ({ year, month, day })

/**
 * September 2026, pinned.
 *
 * `today` is a prop for exactly this: the grid marks a day with
 * `aria-current`, and a suite that let the real clock decide which one would
 * pass or fail depending on the day it ran on.
 */
const defaults: HozoCalendarProps = {
  today: date(2026, 9, 24),
  defaultMonth: { year: 2026, month: 9 },
  locale: 'en-US',
  firstDayOfWeek: 1,
}

const render = (props: Partial<HozoCalendarProps> = {}) =>
  renderToStaticMarkup(createElement(HozoCalendar, { ...defaults, ...props }))

function attributes(html: string, name: string): string[] {
  return [...html.matchAll(new RegExp(`${name}="([^"]*)"`, 'g'))].map((match) => match[1] ?? '')
}

const count = (html: string, needle: string) => html.split(needle).length - 1

/**
 * Buttons carrying `disabled`, matched on the tag rather than the attribute.
 *
 * `data-hozo-disabled=""` ends in the same characters, so counting the bare
 * attribute counts the day cells too -- which is how the first version of
 * this file claimed eleven disabled buttons.
 */
const disabledButtons = (html: string) => [...html.matchAll(/<button[^>]*\sdisabled=""/g)].length

test('the month is a grid, named by the heading that says which month it is', () => {
  const html = render()
  assert.match(html, /role="grid"/)
  const [headingId] = attributes(html, 'id')
  const [labelledBy] = attributes(html, 'aria-labelledby')
  assert.ok(headingId, 'the heading has an id')
  assert.equal(labelledBy, headingId, 'and the grid points at it')
  assert.match(html, /September 2026/)
})

test('the heading announces itself when paging changes it', () => {
  assert.match(render(), /aria-live="polite"/)
})

test('the group carries the label the caller gave it', () => {
  const html = render({ accessibilityLabel: 'Departure date' })
  assert.match(html, /role="group"/)
  assert.match(html, /aria-label="Departure date"/)
})

test('seven column headers, kept out of the accessibility tree', () => {
  const html = render()
  assert.equal(count(html, 'scope="col"'), 7)
  // Hidden because each cell already says which weekday it is: a user
  // arriving by arrow key never passes through the header.
  assert.match(html, /<thead aria-hidden="true">/)
  assert.match(html, /abbr="Monday"/, 'the full name is still there for `abbr`')
  assert.match(html, /abbr="Sunday"/)
})

test('six weeks of cells, and exactly one tab stop among them', () => {
  const html = render()
  assert.equal(count(html, 'role="gridcell"'), 42)
  const stops = attributes(html, 'tabindex')
  assert.equal(
    stops.filter((value) => value === '0').length,
    1,
    'one tab stop, so Tab enters the grid once and the arrows do the rest',
  )
  assert.equal(stops.filter((value) => value === '-1').length, 41)
})

test('each cell is named by its whole date, not by the number it shows', () => {
  const html = render()
  assert.match(html, /aria-label="Thursday, September 24, 2026"/)
  assert.match(html, /aria-label="Monday, August 31, 2026"/, 'including the days from August')
})

test('today is marked, and marked only once', () => {
  assert.equal(count(render(), 'aria-current="date"'), 1)
})

test('the selected day is marked, and is not confused with today', () => {
  const html = render({ value: date(2026, 9, 10) })
  assert.equal(attributes(html, 'aria-selected').filter((value) => value === 'true').length, 1)
  assert.equal(count(html, 'aria-current="date"'), 1)
  assert.doesNotMatch(
    html,
    /aria-selected="true"[^>]*aria-current="date"/,
    'the 10th is selected and the 24th is today, so no cell carries both',
  )
})

test('a day outside the bounds says so, in both vocabularies', () => {
  const html = render({ min: date(2026, 9, 10) })
  // August 31st and the first nine days of September: every cell before the
  // minimum in a Monday-first September 2026 grid.
  assert.equal(count(html, 'aria-disabled="true"'), 10)
  assert.equal(count(html, 'data-hozo-disabled=""'), 10, 'the hook a `disabled:` variant needs')
})

test('a month with nothing reachable in it cannot be paged to', () => {
  // Every day in August is before the minimum, so going back is refused.
  // October is unbounded, so going forward is not.
  assert.equal(disabledButtons(render({ min: date(2026, 9, 10) })), 1)
  assert.equal(disabledButtons(render()), 0, 'unbounded, so both directions are open')
})

test('days from a neighbouring month are flagged, so a style can dim them', () => {
  // One from August and eleven from October, in a six-week September grid.
  assert.equal(count(render(), 'data-hozo-outside=""'), 12)
})

test('the day number goes through Intl rather than being concatenated', () => {
  assert.match(render(), />24</)
  assert.doesNotMatch(
    render({ locale: 'en-US-u-nu-arab' }),
    />24</,
    'a locale asking for other digits gets them, which `String(day)` could not do',
  )
})

test('renderDay replaces the contents and is told what the day is', () => {
  const mark = (selected: boolean, today: boolean) => {
    if (selected) return 'PICKED'
    return today ? 'TODAY' : ''
  }
  const html = render({
    value: date(2026, 9, 10),
    renderDay: (day) => mark(day.selected, day.today),
  })
  assert.equal(count(html, 'PICKED'), 1)
  assert.equal(count(html, 'TODAY'), 1)
})
