/**
 * Two things styling can break here that behaviour cannot, which is this
 * package's share of the verification (#638 §6).
 *
 * A closed panel is hidden by the `hidden` attribute, because `@hozo/patterns`
 * ships no CSS and a panel that stayed visible until a stylesheet arrived
 * would be a broken control rather than an unstyled one. `hidden` is
 * `display: none` from the user agent, and **any** display utility in the
 * panel's class list beats it -- one `flex` there and every panel is open, with
 * `aria-expanded="false"` on the trigger saying otherwise. That is a reader
 * being lied to by a layout class, so it is a test.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { Accordion, type AccordionItem } from './index.ts'

const ITEMS: AccordionItem[] = [
  { header: 'Shipping', content: 'Two days.' },
  { header: 'Returns', content: 'Thirty days.' },
  { header: 'Gift wrap', content: 'Not yet.', disabled: true },
]

const render = () =>
  renderToStaticMarkup(
    createElement(Accordion, { items: ITEMS, defaultExpanded: '0', accessibilityLabel: 'Help' }),
  )

/** Every `role="region"` opening tag, which is one per panel. */
const panels = (html: string): string[] =>
  [...html.matchAll(/<div[^>]*role="region"[^>]*>/g)].map((found) => found[0])

test('a closed panel keeps the hidden attribute and no class list overrides it', () => {
  const html = render()
  const closed = panels(html).filter((tag) => tag.includes('hidden'))
  assert.equal(closed.length, 2, 'two of the three panels start closed')
  for (const tag of closed) {
    assert.doesNotMatch(
      tag,
      /class="[^"]*\b(block|flex|grid|inline|inline-block|inline-flex|table|contents)\b/,
      'a display utility in the panel list would beat the hidden attribute',
    )
  }
})

test('the chevron is drawn from the state the pattern writes, not from a prop', () => {
  // `data-hozo-state` is on the trigger on every render, and the class list
  // selects on it. Nothing here is passed a boolean it could disagree with --
  // the arrangement `Checkbox` and `Switch` use for the same reason.
  const html = render()
  const open = /<button[^>]*data-hozo-state="open"[^>]*>/.exec(html)
  assert.ok(open, 'the pattern no longer writes data-hozo-state')
  assert.match(open[0], /data-\[hozo-state=open\]:after:rotate-135/)
  assert.match(open[0], /aria-expanded="true"/)
})

test('the heading carries no size, because its level is the caller’s', () => {
  // A component that styled `h3` would be styling whichever level the page
  // needed. The row's type is on the button inside it.
  const html = render()
  const heading = /<h3[^>]*>/.exec(html)
  assert.ok(heading, 'the default heading level is 3')
  assert.doesNotMatch(heading[0], /\btext-(xs|sm|base|lg|xl|2xl)\b/)
})
