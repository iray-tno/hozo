/**
 * What a rendered bottom sheet is, and what these tests cannot see.
 *
 * `renderToStaticMarkup` has no pointer, no layout and no focus, so the drag
 * itself is out of reach here -- which is exactly why the arithmetic lives in
 * `sheet-rules.ts` and is tested there against numbers instead. The trap is
 * `FocusScope`'s and Escape is `DismissableLayer`'s, both tested in
 * `@hozo/behaviors`. What is left for this file is the markup: the roles, the
 * name, and the one decision that shows up in the DOM -- whether the handle is a
 * control.
 *
 * `portal: false` throughout, because `Portal` renders nothing until it has
 * mounted and a server render of a portalled sheet is an empty string. The same
 * reason `tooltip.test.ts` passes it.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { BottomSheet } from './index.ts'

const render = (props: Record<string, unknown>) =>
  renderToStaticMarkup(
    createElement(
      BottomSheet,
      { portal: false, accessibilityLabel: 'Filters', ...props },
      createElement('button', { type: 'button' }, 'Apply'),
    ),
  )

test('a closed sheet renders nothing at all', () => {
  assert.equal(render({ open: false }), '')
})

test('an open sheet is a modal dialog with a name', () => {
  const html = render({ open: true })
  assert(html.includes('role="dialog"'))
  assert(html.includes('aria-modal="true"'))
  assert(html.includes('aria-label="Filters"'))
  assert(html.includes('Apply'))
})

test('a name comes from one place at a time', () => {
  const html = render({ open: true, accessibilityLabelledBy: 'filters-heading' })
  assert(html.includes('aria-labelledby="filters-heading"'))
  // Both together would mean the label silently does nothing.
  assert(!html.includes('aria-label='))
})

test('the scrim is not in the accessibility tree', () => {
  const html = render({ open: true, scrimClassName: 'scrim' })
  assert(html.includes('aria-hidden="true"'))
  assert(html.includes('class="scrim"'))
})

test('one detent makes the handle decoration, and several make it a button', () => {
  const single = render({ open: true, handleClassName: 'handle' })
  // Drag-to-dismiss has a single-pointer alternative already -- the scrim, and
  // Escape -- so there is nothing for a reader to be offered here.
  assert(!single.includes('aria-label="Resize"'))
  assert(single.includes('<div aria-hidden="true" class="handle"'))

  const several = render({ open: true, handleClassName: 'handle', detents: [0.5, 1] })
  // Now dragging is the only way to change the size, which WCAG 2.5.7 says has
  // to be reachable with a single pointer that does not drag.
  assert(several.includes('<button'))
  assert(several.includes('aria-label="Resize"'))
})

test('the handle can be renamed, because "Resize" is English', () => {
  const html = render({ open: true, detents: [0.5, 1], handleAccessibilityLabel: 'サイズ変更' })
  assert(html.includes('aria-label="サイズ変更"'))
})

test('the sheet opens at its default detent, showing that much of itself', () => {
  // The transform is a percentage of the element's own height, so this is the
  // whole of the positioning and nothing had to be measured to write it.
  assert(render({ open: true, detents: [0.5, 1] }).includes('translateY(0%)'))
  assert(render({ open: true, detents: [0.5, 1], defaultDetent: 0.5 }).includes('translateY(50%)'))
  // A detent that is not on the list is clamped to the largest one rather than
  // opening the sheet to a size it has no resting place at.
  assert(render({ open: true, detents: [0.5], defaultDetent: 1 }).includes('translateY(50%)'))
})

test('nothing carries a class it was not given', () => {
  const html = render({ open: true })
  assert(!html.includes('class='))
})
