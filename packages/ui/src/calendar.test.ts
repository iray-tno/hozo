/**
 * The two target sizes, and the two meanings of `aria-selected`.
 *
 * `@hozo/form`'s README warns that a month button holding `‹` renders about
 * four pixels wide under a reset, because warning was all it could do -- the
 * package ships no CSS. This is the layer that fixes it, so this is where the
 * fix is asserted, in pixels rather than in prose.
 *
 * The other half is the range mode. `aria-selected` is on every day between the
 * ends, so a list that filled it would paint a range as one block; the ends
 * come from the data attributes instead. Getting that backwards produces a
 * calendar that looks plausible and cannot show you where your range starts,
 * which no rendering test would notice unless it asked this question directly.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { Calendar } from './index.ts'

const TODAY = { year: 2026, month: 9, day: 24 }

const render = (props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(Calendar, {
      accessibilityLabel: 'Pick a day',
      today: TODAY,
      defaultMonth: { year: 2026, month: 9 },
      locale: 'en-GB',
      ...props,
    }),
  )

/** Every opening tag of the given element name. */
const tags = (html: string, name: string): string[] =>
  [...html.matchAll(new RegExp(`<${name}[^>]*>`, 'g'))].map((found) => found[0])

/** The pixel size a Tailwind spacing step is, as this package writes them. */
const px = (step: number) => step * 4

test('a month button clears the 24px minimum, which is the trap this closes', () => {
  // `size-9` is 36. Under Preflight and without it the button is the width of
  // one glyph -- about four pixels, measured in `@hozo/form`, which could only
  // say so in a doc comment.
  const buttons = tags(render(), 'button').filter((tag) => tag.includes('size-'))
  assert.equal(buttons.length, 2, 'the two month buttons')
  for (const tag of buttons) {
    const size = /\bsize-(\d+)\b/.exec(tag)
    assert.ok(size, `no size on ${tag.slice(0, 80)}`)
    assert.ok(px(Number(size[1])) >= 24, `${px(Number(size[1]))}px is under 2.5.8's 24`)
  }
})

test('a day cell is at least 24px wide, which one digit is not', () => {
  const cells = tags(render(), 'td').filter((tag) => tag.includes('min-w-'))
  assert.ok(cells.length > 27, 'a month of cells')
  const width = /\bmin-w-(\d+)\b/.exec(cells[0] ?? '')
  assert.ok(width, 'no minimum width on a day cell')
  assert.ok(px(Number(width[1])) >= 24, `${px(Number(width[1]))}px is under 2.5.8's 24`)
})

test('single mode fills aria-selected, because there it means the one day', () => {
  const html = render({ value: { year: 2026, month: 9, day: 10 } })
  const chosen = tags(html, 'td').filter((tag) => tag.includes('aria-selected="true"'))
  assert.equal(chosen.length, 1)
  assert.match(chosen[0] ?? '', /aria-selected:bg-hozo-accent/)
})

test('range mode does not, because there it means every day between the ends', () => {
  // The distinction the two lists exist for. `@hozo/form` sets `aria-selected`
  // across the whole range -- it is the only attribute ARIA has for that -- so
  // the ends have to come from `data-hozo-range-start` and `-end`.
  const html = render({
    range: true,
    value: { start: { year: 2026, month: 9, day: 10 }, end: { year: 2026, month: 9, day: 14 } },
  })
  const selected = tags(html, 'td').filter((tag) => tag.includes('aria-selected="true"'))
  assert.equal(selected.length, 5, 'five days are selected, which is what the attribute says')
  for (const tag of selected) {
    assert.doesNotMatch(tag, /aria-selected:bg-/, 'filling this would erase the ends')
    assert.match(tag, /data-\[hozo-range-start\]:bg-hozo-accent/)
  }
  // And the middle is distinguishable from the caps in the markup, which is
  // what the class list selects on.
  const middle = selected.filter((tag) => tag.includes('data-hozo-in-range'))
  assert.equal(middle.length, 3)
})

test('today is underlined rather than announced twice', () => {
  // `aria-current="date"` already says it. The marker is a pseudo-element on a
  // span, so a reader finds nothing extra -- and it is not `aria-[current=date]:`
  // because Hozo compiles only the boolean ARIA states.
  const html = render()
  assert.match(html, /aria-current="date"/)
  assert.match(html, /after:border-b-2/)
  assert.doesNotMatch(html, /aria-\[current/)
})
