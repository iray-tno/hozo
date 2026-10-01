/**
 * What a rendered drawer is, and what is not in here.
 *
 * The trap is `FocusScope`'s, Escape is `DismissableLayer`'s, and both are tested
 * in `@hozo/behaviors`. The gesture is on the native half only, and its
 * arithmetic is `sheet-rules.test.ts`. The scroll lock touches `document.body`,
 * which a server render does not have -- `useScrollLock` is written to do nothing
 * without a document, and that is the one assertion possible here: that calling
 * this on a server does not throw.
 *
 * `portal: false` throughout, because `Portal` renders nothing until it has
 * mounted and a server render of a portalled drawer is an empty string.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { Drawer } from './index.ts'

const render = (props: Record<string, unknown>) =>
  renderToStaticMarkup(
    createElement(
      Drawer,
      { portal: false, accessibilityLabel: 'Navigation', ...props },
      createElement('a', { href: '/docs' }, 'Docs'),
    ),
  )

test('a closed drawer renders nothing at all', () => {
  assert.equal(render({ open: false }), '')
})

test('an open drawer is a modal dialog with a name', () => {
  const html = render({ open: true })
  assert(html.includes('role="dialog"'))
  assert(html.includes('aria-modal="true"'))
  assert(html.includes('aria-label="Navigation"'))
  assert(html.includes('Docs'))
})

test('a name comes from one place at a time', () => {
  const html = render({ open: true, accessibilityLabelledBy: 'nav-heading' })
  assert(html.includes('aria-labelledby="nav-heading"'))
  assert(!html.includes('aria-label='))
})

test('the side is on the element, so a class list can read it', () => {
  // Left by default, and written out rather than left implicit: the look needs
  // to know which edge it is against, and a missing attribute is a third state
  // nobody styled.
  assert(render({ open: true }).includes('data-hozo-side="left"'))
  assert(render({ open: true, side: 'right' }).includes('data-hozo-side="right"'))
})

test('the scrim is not in the accessibility tree', () => {
  const html = render({ open: true, scrimClassName: 'scrim' })
  assert(html.includes('<div aria-hidden="true" class="scrim">'))
})

test('nothing carries a class it was not given', () => {
  // `data-hozo-side` is still there, which is the point of checking for `class=`
  // rather than for the absence of attributes.
  const html = render({ open: true })
  assert(!html.includes('class='))
})
