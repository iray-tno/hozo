/**
 * What styling can get wrong about a `<dialog>`, which is mostly "fighting the
 * element".
 *
 * A modal `<dialog>` is centred by the user agent and raised into the top
 * layer by `showModal()`. Positioning it ourselves would take it out of that
 * arrangement and put it somewhere fixed on the page, which looks right until
 * the page scrolls. So the panel's list carries no positioning at all, and
 * that absence is the thing worth asserting -- an addition nobody would
 * question is exactly how it would arrive.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { Dialog, type DialogProps } from './index.ts'

const render = (props: Partial<DialogProps> = {}) =>
  renderToStaticMarkup(
    createElement(
      Dialog,
      { open: true, accessibilityLabel: 'Delete this?', ...props },
      'It cannot be undone.',
    ),
  )

test('it is a real dialog element, so the platform owns the modality', () => {
  const html = render()
  assert.match(html, /^<dialog/)
  assert.match(html, /aria-label="Delete this\?"/)
})

test('the scrim is the element’s own backdrop rather than a second element', () => {
  const html = render()
  assert.match(html, /backdrop:bg-hozo-scrim\/50/)
  // One element in, one element out: nothing here adds an overlay div, which
  // is the thing that would need a z-index and would be unreachable.
  assert.equal(html.match(/<div/g), null)
})

test('the panel does not position itself', () => {
  assert.doesNotMatch(render(), /class="[^"]*\b(fixed|absolute|sticky|inset-0|top-1\/2)\b/)
})

test('it can scroll, because the part a dialog clips is the part with the buttons', () => {
  const html = render()
  assert.match(html, /overflow-y-auto/)
  assert.match(html, /max-h-\[85vh\]/)
})

test('the caller’s classes join the package’s rather than replacing them', () => {
  const html = render({ className: 'max-w-lg' })
  assert.match(html, /rounded-hozo-panel/)
  assert.match(html, /max-w-lg/)
})
