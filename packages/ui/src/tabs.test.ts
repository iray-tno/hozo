/**
 * The two things a class list can break here, both invisible in a snapshot.
 *
 * An unselected panel is hidden by the `hidden` attribute, and any display
 * utility in the panel's list beats it -- every panel visible at once, with
 * `aria-selected` naming one of them. An unavailable tab must also expose the
 * same fact to native button behavior, compiled selectors and its ARIA look;
 * roving focus skips it rather than offering a focusable disabled exception.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { type Tab, Tabs, type TabsProps } from './index.ts'

const TABS: Tab[] = [
  { label: 'Details', content: 'What it is.' },
  { label: 'Shipping', content: 'When it comes.' },
  { label: 'Returns', content: 'Not yet.', disabled: true },
]

const render = (props: Partial<TabsProps> = {}) =>
  renderToStaticMarkup(
    createElement(Tabs, { tabs: TABS, accessibilityLabel: 'Product', ...props } as TabsProps),
  )

/** Every opening tag with the given role. */
const tags = (html: string, role: string): string[] =>
  [...html.matchAll(new RegExp(`<[a-z]+[^>]*role="${role}"[^>]*>`, 'g'))].map((found) => found[0])

test('a hidden panel stays hidden, because no display utility is in its list', () => {
  const html = render()
  const hidden = tags(html, 'tabpanel').filter((tag) => tag.includes('hidden'))
  assert.equal(hidden.length, 2, 'two of three panels start hidden')
  for (const tag of hidden) {
    assert.doesNotMatch(
      tag,
      /class="[^"]*\b(block|flex|grid|inline|inline-block|inline-flex|table|contents)\b/,
      'a display utility would beat the hidden attribute',
    )
  }
})

test('the chosen tab is styled from what a reader is told, not from a prop', () => {
  const html = render({ defaultIndex: 1 })
  const chosen = tags(html, 'tab').filter((tag) => tag.includes('aria-selected="true"'))
  assert.equal(chosen.length, 1)
  assert.match(chosen[0] ?? '', /aria-selected:border-hozo-accent/)
})

test('a disabled tab retains its ARIA look alongside actual unavailable behavior', () => {
  const html = render()
  const off = tags(html, 'tab').filter((tag) => tag.includes('aria-disabled="true"'))
  assert.equal(off.length, 1)
  assert.match(off[0] ?? '', / disabled=""/)
  assert.match(off[0] ?? '', /data-hozo-disabled=""/)
  assert.match(off[0] ?? '', /tabindex="-1"/)
  assert.match(off[0] ?? '', /aria-disabled:cursor-not-allowed/)
})

test('a vertical strip marks the inline end rather than the bottom', () => {
  // `border-e-2`, not `border-r-2`: the strip flips with the document and a
  // right border would sit on the outside edge in Arabic or Hebrew.
  const html = render({ orientation: 'vertical' })
  const [first] = tags(html, 'tab')
  assert.match(first ?? '', /border-e-2/)
  assert.doesNotMatch(first ?? '', /border-b-2/)
})
