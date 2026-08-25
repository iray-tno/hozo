// What the components actually render.
//
// The rules these are built on are tested as rules -- `roving.test.ts`,
// `typeahead.test.ts`, `focus.test.ts` -- and none of that establishes
// that the ARIA wiring is right. A tab whose `aria-controls` points at no
// panel, a panel whose `aria-labelledby` names no tab, a strip that is
// every element's tab stop instead of one: all of those render, look
// correct, and are broken only for someone who cannot see them.
//
// Static markup rather than a real DOM, the same choice
// `@hozo/tailwind-conformance`'s render check makes: the question is what
// comes out, and the behaviour is already covered where the decisions are
// made.
//
// `createElement` rather than JSX, and `.ts` rather than `.tsx`, because
// Node strips types on its own and does not transform JSX -- so a `.tsx`
// test needs a build step that nothing else in this package has.

import assert from 'node:assert/strict'
import { createElement } from 'react'
import { test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'

// From `dist`, not from source: these components are `.tsx` and Node
// transforms types but not JSX, so the built output is the only thing it
// can load -- which also makes this a check of what actually ships rather
// than of what tsc was handed.
import { HozoMenu, HozoTabs, type HozoTabsProps } from '../dist/index.js'

const tabs = [
  { label: 'Profile', content: 'profile' },
  { label: 'Billing', content: 'billing' },
  { label: 'Closed', content: 'closed', disabled: true },
]

const strip = (props: Partial<HozoTabsProps> = {}) =>
  renderToStaticMarkup(createElement(HozoTabs, { tabs, accessibilityLabel: 'Account', ...props }))

/** Every `name="value"` for one attribute, in document order. */
function attributes(html: string, name: string): string[] {
  return [...html.matchAll(new RegExp(`${name}="([^"]*)"`, 'g'))].map((match) => match[1] ?? '')
}

test('a tab points at its panel and the panel back at the tab', () => {
  const html = strip()
  const ids = attributes(html, 'id')
  const tabIds = ids.filter((id) => id.includes('-tab-'))
  const panelIds = ids.filter((id) => id.includes('-panel-'))

  assert.equal(tabIds.length, 3)
  assert.deepEqual(attributes(html, 'aria-controls'), panelIds, 'each tab names a panel that exists')
  assert.deepEqual(attributes(html, 'aria-labelledby'), tabIds, 'each panel names a tab that exists')
})

test('the strip is one tab stop, not three', () => {
  // The whole point of the pattern. Without it, Tab past a six-tab strip
  // is six presses.
  const stops = attributes(strip(), 'tabindex')
  assert.equal(stops.filter((value) => value === '0').length, 2, 'the active tab and the panel')
  assert.equal(stops.filter((value) => value === '-1').length, 2, 'the other two tabs')
})

test('a disabled tab keeps its place and says so', () => {
  // `aria-disabled`, never the `disabled` attribute: that one takes the
  // button out of the accessibility tree and leaves the strip with a gap
  // nobody can reach or be told about.
  const html = strip()
  assert.match(html, /aria-disabled="true"/)
  assert.doesNotMatch(html, /<button[^>]*\sdisabled[\s>]/)
  assert.equal(attributes(html, 'role').filter((role) => role === 'tab').length, 3)
})

test('only the selected panel has anything in it', () => {
  const html = strip()
  assert.match(html, /profile/)
  assert.doesNotMatch(html, /billing/, 'an unselected panel renders nothing, so nothing mounts')
  assert.equal(attributes(html, 'aria-selected').filter((value) => value === 'true').length, 1)
})

test('the strip says which way its arrows go', () => {
  assert.match(strip(), /aria-orientation="horizontal"/)
  assert.match(strip({ orientation: 'vertical' }), /aria-orientation="vertical"/)
  // `both` has no ARIA spelling, so it says nothing rather than claiming
  // one of the two.
  assert.doesNotMatch(strip({ orientation: 'both' }), /aria-orientation/)
})

test('a closed menu is a button that says it opens one', () => {
  const html = renderToStaticMarkup(
    createElement(HozoMenu, {
      trigger: 'Actions',
      items: [{ label: 'Duplicate' }],
      accessibilityLabel: 'Actions',
    }),
  )
  assert.match(html, /aria-haspopup="menu"/)
  assert.match(html, /aria-expanded="false"/)
  // Nothing to control yet, so nothing is claimed: `aria-controls` naming
  // an element that is not in the document is a dangling reference, and a
  // screen reader following it finds nothing.
  assert.doesNotMatch(html, /aria-controls/)
  assert.doesNotMatch(html, /role="menu"/)
})
