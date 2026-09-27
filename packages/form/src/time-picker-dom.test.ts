import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { HozoTimePicker, type HozoTimePickerProps } from './time-picker.tsx'

/**
 * What this suite can and cannot reach.
 *
 * `renderToStaticMarkup` produces the markup and runs no effects and no
 * handlers, so the semantics are assertable and the stepping is not. The
 * arithmetic the arrows call -- `addHours`, `addMinutes`, `withPeriod`,
 * `isWithinTime` -- is covered in `time.test.ts`; the wiring between a key
 * and those functions is covered by neither, and saying so is better than
 * leaving it to be assumed.
 */
const defaults: HozoTimePickerProps = { locale: 'en-US', hour12: false }

const render = (props: Partial<HozoTimePickerProps> = {}) =>
  renderToStaticMarkup(createElement(HozoTimePicker, { ...defaults, ...props }))

function attributes(html: string, name: string): string[] {
  return [...html.matchAll(new RegExp(`${name}="([^"]*)"`, 'g'))].map((match) => match[1] ?? '')
}

const count = (html: string, needle: string) => html.split(needle).length - 1

test('two spinbuttons in a named group', () => {
  const html = render({ accessibilityLabel: 'Arrival time' })
  assert.match(html, /role="group"/)
  assert.match(html, /aria-label="Arrival time"/)
  assert.equal(count(html, 'role="spinbutton"'), 2)
  assert.match(html, /aria-label="Hour"/)
  assert.match(html, /aria-label="Minute"/)
})

test('a twenty-four hour clock counts from zero and has no period', () => {
  const html = render({ value: { hour: 14, minute: 5 } })
  const low = attributes(html, 'aria-valuemin')
  const high = attributes(html, 'aria-valuemax')
  assert.deepEqual(low, ['0', '0'])
  assert.deepEqual(high, ['23', '59'])
  assert.deepEqual(attributes(html, 'aria-valuenow'), ['14', '5'])
  assert.match(html, />14</, 'the hour reads as itself')
  assert.match(html, />05</, 'and the minute keeps its leading zero')
  assert.equal(count(html, 'aria-label="AM or PM"'), 0, 'nothing to toggle on this clock')
})

test('a twelve-hour clock counts from one and gains a period', () => {
  const html = render({ hour12: true, value: { hour: 14, minute: 5 } })
  assert.deepEqual(attributes(html, 'aria-valuemin'), ['1', '0'])
  assert.deepEqual(attributes(html, 'aria-valuemax'), ['12', '59'])
  assert.deepEqual(attributes(html, 'aria-valuenow'), ['2', '5'], 'two in the afternoon')
  assert.match(html, /<button/)
  assert.match(html, /aria-label="AM or PM"/)
  assert.match(html, />PM</)
})

test('each field says the whole time, not its own digits', () => {
  // A reader moving the hour wants to hear where that put the time. "14" is
  // the one thing they already knew, so `aria-valuetext` is the whole of it
  // on every field.
  const html = render({ hour12: true, value: { hour: 14, minute: 5 } })
  const spoken = attributes(html, 'aria-valuetext')
  assert.equal(spoken.length, 2)
  for (const text of spoken) {
    assert.match(text, /2:05/)
    assert.match(text, /PM/i)
  }
})

test('the period markers come from the caller, because Intl was not asked', () => {
  // `formatToParts` would return them localised and its presence on Hermes is
  // unestablished, so they are chrome with an English default like every other
  // word here.
  const html = render({
    hour12: true,
    value: { hour: 14, minute: 5 },
    periodLabels: { am: '午前', pm: '午後' },
  })
  assert.match(html, />午後</)
  assert.doesNotMatch(html, />PM</)
})

test('nothing chosen is a field that says so, with no value on it', () => {
  const html = render({ value: null })
  assert.equal(count(html, '>--<'), 2)
  assert.deepEqual(attributes(html, 'aria-valuenow'), [], 'absent rather than zero')
  assert.deepEqual(attributes(html, 'aria-valuetext'), ['--', '--'])
  assert.match(render({ value: null, emptyLabel: '__' }), />__</)
})

test('a disabled picker is out of the tab order and says it is disabled', () => {
  const html = render({ hour12: true, value: { hour: 9, minute: 0 }, disabled: true })
  assert.equal(count(html, 'aria-disabled="true"'), 2)
  assert.equal(count(html, 'data-hozo-disabled=""'), 2, 'the hook a `disabled:` variant needs')
  assert.deepEqual(attributes(html, 'tabindex'), ['-1', '-1', '-1', '-1', '-1', '-1'])
  assert.equal(count(html, ' disabled=""'), 5, 'four arrows and the period, all of them')
})

test('an enabled field is one tab stop, and its arrows are not stops at all', () => {
  // Arrow, value, arrow, twice. The field answers Up and Down itself, so
  // putting its arrows in the tab order would make it three stops where it is
  // one, for two controls that do what two keys already do. A pointer gains
  // something; the keyboard path is untouched.
  const html = render({ value: { hour: 9, minute: 0 } })
  assert.deepEqual(attributes(html, 'tabindex'), ['-1', '0', '-1', '-1', '0', '-1'])
})

test('each field has an arrow either side of it, named and pointed', () => {
  const html = render({ value: { hour: 9, minute: 0 } })
  assert.deepEqual(attributes(html, 'data-hozo-step'), [
    'increase',
    'decrease',
    'increase',
    'decrease',
  ])
  for (const name of ['Increase Hour', 'Decrease Hour', 'Increase Minute', 'Decrease Minute']) {
    assert.equal(count(html, `aria-label="${name}"`), 1, name)
  }
  assert.match(render({ value: null, increaseLabel: 'Plus' }), /aria-label="Plus Hour"/)
})

test('a field is a group, and the group is what the field class dresses', () => {
  // Which is where the Native half puts `fieldStyle`. The arrows sit inside
  // the group's right edge or above and below it, and which of the two is a
  // stylesheet's decision rather than Hozo's -- so the class cannot be on the
  // spinbutton, or neither layout would have anything to hang off.
  const html = render({ value: { hour: 9, minute: 0 }, fieldClassName: 'F', stepClassName: 'S' })
  assert.deepEqual(attributes(html, 'data-hozo-field'), ['hour', 'minute'])
  assert.equal(count(html, 'class="F"'), 2)
  assert.equal(count(html, 'class="S"'), 4)
})

test('the fields follow a controlled value rather than their own state', () => {
  assert.match(render({ value: { hour: 7, minute: 45 } }), />45</)
  assert.match(render({ value: { hour: 23, minute: 0 } }), />23</)
  // `defaultValue` is what an uncontrolled one starts on, and a static render
  // is the only state it will ever be seen in here.
  assert.match(render({ defaultValue: { hour: 6, minute: 15 } }), />15</)
})
