import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { Accordion, type AccordionProps } from './index.ts'

const items = [
  { id: 'shipping', header: 'Shipping', content: 'Two days.' },
  { id: 'returns', header: 'Returns', content: 'Thirty days.' },
  { id: 'sizing', header: 'Sizing', content: 'Runs small.', disabled: true },
]

const render = (props: Partial<AccordionProps> = {}) =>
  renderToStaticMarkup(
    createElement(Accordion, { items, accessibilityLabel: 'Help', ...props } as AccordionProps),
  )

const count = (html: string, needle: string) => html.split(needle).length - 1

test('each header is a button in a heading, and the level is the caller’s', () => {
  // A component that hard-coded `<h3>` would jump from `<h1>` to `<h3>` in
  // half the pages it appeared on, and heading order is one of the few things
  // a reader navigates by.
  assert.equal(count(render(), '<h3'), 3, 'the default, which is a guess and says so')
  assert.equal(count(render({ headingLevel: 2 }), '<h2'), 3)
  assert.equal(count(render({ headingLevel: 2 }), '<h3'), 0)
  assert.equal(count(render(), '<button'), 3)
})

test('every header is its own tab stop, unlike Tabs next door', () => {
  // The Authoring Practices are explicit: all focusable elements in an
  // accordion are in the page tab sequence. A roving group would make a
  // reader pass the whole set to reach one panel, which is right for a
  // chooser and wrong for a list of things to act on.
  assert.doesNotMatch(render(), /tabindex/i)
})

test('a trigger points at its panel and the panel back at the trigger', () => {
  const html = render()
  const trigger = /id="([^"]*-trigger-0)"/.exec(html)?.[1]
  const panel = /id="([^"]*-panel-0)"/.exec(html)?.[1]
  assert.ok(trigger && panel)
  assert.match(html, new RegExp(`aria-controls="${panel}"`))
  assert.match(html, new RegExp(`aria-labelledby="${trigger}"`))
  assert.equal(count(html, 'role="region"'), 3, 'a panel is a region whether it is open or not')
})

test('a closed panel is hidden rather than removed', () => {
  // `aria-controls` has to point at something that exists. A reader following
  // it into nothing is worse than one finding a collapsed region -- and
  // `hidden` is the attribute rather than a class, because this package ships
  // no CSS and a panel that stayed visible until a stylesheet arrived would
  // be a broken control rather than an unstyled one.
  const html = render()
  assert.equal(count(html, 'hidden=""'), 3, 'all three, with nothing expanded')
  assert.match(html, /Thirty days\./, 'the content is in the markup either way')
  assert.equal(count(html, 'aria-expanded="false"'), 3)
})

test('single mode opens one and closes the rest', () => {
  const html = render({ defaultExpanded: 'returns' })
  assert.equal(count(html, 'aria-expanded="true"'), 1)
  assert.equal(count(html, 'hidden=""'), 2)
  assert.match(html, /aria-expanded="true"[^>]*>Returns/, 'and it is the one that was named')
})

test('multiple mode opens as many as it is given', () => {
  const html = render({ multiple: true, defaultExpanded: ['shipping', 'returns'] })
  assert.equal(count(html, 'aria-expanded="true"'), 2)
  assert.equal(count(html, 'hidden=""'), 1)
})

test('a disabled section says so to the platform, not only to a reader', () => {
  // ADR 001: the real attribute, which takes it out of the tab order and
  // stops the click, rather than `aria-disabled` next to a live control.
  const html = render()
  assert.equal(count(html, ' disabled=""'), 1)
  assert.doesNotMatch(html, /aria-disabled/)
  // And to a stylesheet, which is a third audience: Hozo's `disabled:`
  // variant compiles to `[data-hozo-disabled]`, so without this a styled
  // accordion's disabled row looks exactly like an enabled one.
  assert.equal(count(html, 'data-hozo-disabled=""'), 1)
})

test('sections are keyed by id, so reordering does not move the open panel', () => {
  // Position works until the list is reordered, and then it silently opens a
  // different section -- the same bargain `RadioGroup` documents.
  const reordered = [items[1], items[0], items[2]] as typeof items
  const html = renderToStaticMarkup(
    createElement(Accordion, {
      items: reordered,
      defaultExpanded: 'returns',
    } as AccordionProps),
  )
  assert.match(html, /aria-expanded="true"[^>]*>Returns/)
  assert.equal(count(html, 'aria-expanded="true"'), 1)
})

test('nothing carries a class it was not given', () => {
  assert.doesNotMatch(render(), /class=/)
  const html = render({
    className: 'A',
    sectionClassName: 'S',
    headingClassName: 'H',
    triggerClassName: 'T',
    panelClassName: 'P',
  })
  assert.equal(count(html, 'class="A"'), 1)
  assert.equal(count(html, 'class="S"'), 3)
  assert.equal(count(html, 'class="H"'), 3)
  assert.equal(count(html, 'class="T"'), 3)
  assert.equal(count(html, 'class="P"'), 3)
})

test('open and closed are on the elements a stylesheet can reach', () => {
  // This package ships no CSS, so the chevron and the panel's height are the
  // application's to draw, and it should not have to pass its own state back
  // in to do it.
  const html = render({ defaultExpanded: 'shipping' })
  assert.equal(count(html, 'data-hozo-state="open"'), 2, 'the trigger and its panel')
  assert.equal(count(html, 'data-hozo-state="closed"'), 4)
})
