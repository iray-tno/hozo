/**
 * Where the arrows are, how big they are, and what lights up when focus lands.
 *
 * All three are things a class list can get wrong while the markup stays
 * perfect. The placement is the sharpest: both arrows sit `absolute end-0` and
 * are told apart only by `data-hozo-step`, so a list that lost those two
 * variants would stack them on top of each other at the top of the field --
 * which is exactly what the demo's own story has been doing since the picker
 * shipped, because the scanner cut a class name at its `=` (#679).
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { TimePicker } from './index.ts'

const render = (props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(TimePicker, {
      accessibilityLabel: 'Arrival',
      value: { hour: 9, minute: 30 },
      locale: 'en-US',
      hour12: true,
      ...props,
    }),
  )

const buttons = (html: string): string[] =>
  [...html.matchAll(/<button[^>]*>/g)].map((found) => found[0])

const arrows = (html: string): string[] =>
  buttons(html).filter((tag) => tag.includes('data-hozo-step'))

test('each arrow is placed by the attribute that says which one it is', () => {
  const html = render()
  const up = arrows(html).filter((tag) => tag.includes('data-hozo-step="increase"'))
  const down = arrows(html).filter((tag) => tag.includes('data-hozo-step="decrease"'))
  assert.equal(up.length, 2, 'one per field')
  assert.equal(down.length, 2)
  for (const tag of [...up, ...down]) {
    assert.match(tag, /data-\[hozo-step=increase\]:top-0/)
    assert.match(tag, /data-\[hozo-step=decrease\]:bottom-0/)
  }
})

test('an arrow clears the WCAG 2.5.8 target size', () => {
  // `size-6` is 24. Without a size they are the width of a glyph, which is the
  // same trap the calendar's month buttons are, in the same package.
  for (const tag of arrows(render())) {
    const size = /\bsize-(\d+)\b/.exec(tag)
    assert.ok(size, `no size on ${tag.slice(0, 60)}`)
    assert.ok(Number(size[1]) * 4 >= 24, `${Number(size[1]) * 4}px is under 24`)
  }
})

test('the spinbutton is a target of its own, and carries its own ring', () => {
  // This test used to assert the opposite premise -- that the spinbutton had no
  // class, so the ring had to be `focus-within:` on the group -- and said that
  // the day it gained one, it would stop pretending that was a reason. That day
  // was `check-appearance.mjs` measuring the element at 9 by 20 pixels against
  // WCAG 2.5.8's 24 by 24, and `@hozo/form` gaining `valueClassName`.
  const html = render()
  const spinbutton = /<div[^>]*role="spinbutton"[^>]*>/.exec(html)
  assert.ok(spinbutton, 'no spinbutton')
  assert.match(spinbutton[0], /focus-visible:outline-hozo-focus/, 'on the focused element')
  // 32 wide against a 48-tall field, which clears 24 in both directions. The
  // browser check measures it; this keeps the class that makes it so.
  assert.match(spinbutton[0], /\bmin-w-8\b/)
  assert.match(spinbutton[0], /\bself-stretch\b/)
  assert.doesNotMatch(html, /focus-within:/, 'the ring moved rather than being doubled')
})

test('every control an application can disable has the hook that styles it', () => {
  // Seven: two spinbuttons, four arrows, one period button. The arrows and the
  // period were missing it, so `disabled:` -- which Hozo compiles to
  // `[data-hozo-disabled]` -- matched nothing on five of the seven.
  const html = render({ disabled: true })
  assert.equal(html.match(/data-hozo-disabled=""/g)?.length, 7)
  for (const tag of arrows(html)) assert.match(tag, /disabled:text-hozo-text-subtle/)
})
