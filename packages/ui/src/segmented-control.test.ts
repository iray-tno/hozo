/**
 * A strip of segments, which is a radio group wearing different clothes.
 *
 * There is no behaviour here to test -- it is `@hozo/patterns`' `RadioGroup`, and
 * `patterns/radio.test.ts` covers the roving tab stop, the arrows and the skipped
 * disabled option. What this file is for is the two things the look can get
 * wrong and nothing else would notice.
 *
 * The first is the role. A segmented control and a tab strip are visually the
 * same object and mean different things, and the difference is one attribute:
 * `aria-checked` chooses a value, `aria-selected` chooses a panel. Drawing this
 * on top of `Tabs` would look right and tell a reader to expect a panel that is
 * never coming.
 *
 * The second is the focus ring. The strip clips its corners with
 * `overflow-hidden`, so an outward ring on a segment would be cut off at the two
 * ends of the strip -- which is a focus indicator that exists on three segments
 * out of five. The offset has to be negative, and that is not visible in a
 * screenshot of the middle of the strip.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { SegmentedControl, type SegmentedOption } from './index.ts'

const OPTIONS: SegmentedOption<string>[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month', disabled: true },
]

const render = (props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(SegmentedControl, {
      options: OPTIONS,
      accessibilityLabel: 'Range',
      defaultValue: 'week',
      ...props,
    }),
  )

const segments = (html: string): string[] =>
  [...html.matchAll(/<div[^>]*role="radio"[^>]*>/g)].map((found) => found[0])

test('it is a radio group, not a tab strip', () => {
  const html = render()
  assert(html.includes('role="radiogroup"'))
  assert(html.includes('aria-label="Range"'))
  // The attribute that is the whole difference between the two.
  assert(!html.includes('aria-selected'))
  assert.equal(segments(html).length, 3)
})

test('the strip says which way its arrows go', () => {
  // Horizontal is not a prop here -- a vertical segmented control is a
  // `RadioGroup` -- so the group has to say so on its own.
  assert(render().includes('aria-orientation="horizontal"'))
})

test('the chosen segment is the one aria-checked, and only it', () => {
  const chosen = segments(render()).filter((tag) => tag.includes('aria-checked="true"'))
  assert.equal(chosen.length, 1)
  assert(render().includes('Week'))
})

test('the chosen segment is drawn from that attribute rather than a class', () => {
  const [first] = segments(render())
  assert(first)
  // Every segment carries the same list, including the `aria-checked:` half, so
  // the look cannot disagree with what a reader is told.
  assert.match(first, /aria-checked:bg-hozo-accent/)
  assert.match(first, /aria-checked:text-hozo-on-accent/)
})

test('the focus ring is drawn inward, because the strip clips its corners', () => {
  const [first] = segments(render())
  assert(first)
  assert.match(first, /focus-visible:-outline-offset-2/)
  // And the clipping is really there, which is what makes the line above
  // necessary rather than a preference.
  assert(render().includes('overflow-hidden'))
})

test('a disabled segment keeps its place and says so', () => {
  // `aria-disabled` rather than a real attribute, for the reason `Tabs` records:
  // a disabled element leaves the tab order, and a roving strip needs it to stay.
  const disabled = segments(render()).filter((tag) => tag.includes('aria-disabled="true"'))
  assert.equal(disabled.length, 1)
  assert.match(disabled[0] as string, /tabindex="-1"/)
})
