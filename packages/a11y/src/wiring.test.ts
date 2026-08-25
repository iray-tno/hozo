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
import {
  HozoListbox,
  HozoMenu,
  HozoRadioGroup,
  HozoTabs,
  HozoToolbar,
  HozoTree,
  type HozoTabsProps,
} from '../dist/index.js'

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

test('the toolbar is one tab stop and says which way it goes', () => {
  const html = renderToStaticMarkup(
    createElement(HozoToolbar, {
      accessibilityLabel: 'Formatting',
      items: [
        { render: (props) => createElement('button', { ...props, key: 'b' }, 'B') },
        { render: (props) => createElement('button', { ...props, key: 'i' }, 'I') },
        { render: (props) => createElement('button', { ...props, key: 'u' }, 'U') },
      ],
    }),
  )
  assert.match(html, /role="toolbar"/)
  const stops = attributes(html, 'tabindex')
  assert.deepEqual(stops, ['0', '-1', '-1'], 'twelve buttons should be one Tab, not twelve')
})

test('the radio group puts its tab stop on the chosen option', () => {
  // Not on wherever the keyboard was last. Tabbing into a group and
  // landing on the third option because that is where you were before
  // tells you nothing about what is selected now.
  const html = renderToStaticMarkup(
    createElement(HozoRadioGroup, {
      accessibilityLabel: 'Delivery',
      value: 'express',
      options: [
        { value: 'standard', label: 'Standard' },
        { value: 'express', label: 'Express' },
        { value: 'courier', label: 'Courier', disabled: true },
      ],
    }),
  )
  assert.match(html, /role="radiogroup"/)
  assert.deepEqual(attributes(html, 'tabindex'), ['-1', '0', '-1'])
  assert.deepEqual(attributes(html, 'aria-checked'), ['false', 'true', 'false'])
  assert.match(html, /aria-disabled="true"/)
})

test('a group with nothing chosen is still reachable', () => {
  // An ordinary state, and one where "the tab stop is the chosen option"
  // has no answer -- so it falls to the first option that can hold it,
  // and Tab lands somewhere the arrows can start from.
  const html = renderToStaticMarkup(
    createElement(HozoRadioGroup, {
      accessibilityLabel: 'Delivery',
      options: [
        { value: 'standard', label: 'Standard', disabled: true },
        { value: 'express', label: 'Express' },
      ],
    }),
  )
  assert.deepEqual(attributes(html, 'tabindex'), ['-1', '0'])
  assert.deepEqual(attributes(html, 'aria-checked'), ['false', 'false'])
})

test('a single-select listbox says so and follows its value', () => {
  const html = renderToStaticMarkup(
    createElement(HozoListbox, {
      accessibilityLabel: 'Sort',
      value: 'name',
      options: [
        { value: 'name', label: 'Name' },
        { value: 'date', label: 'Date' },
      ],
    }),
  )
  assert.match(html, /role="listbox"/)
  // Said always, not only when true: a screen reader announces the model
  // on entry, and leaving it off a multi-select means someone finds out
  // that several are allowed by trying.
  assert.match(html, /aria-multiselectable="false"/)
  assert.deepEqual(attributes(html, 'aria-selected'), ['true', 'false'])
  assert.deepEqual(attributes(html, 'tabindex'), ['0', '-1'], 'the tab stop is the chosen option')
})

test('a multi-select listbox keeps focus and selection apart', () => {
  const html = renderToStaticMarkup(
    createElement(HozoListbox, {
      accessibilityLabel: 'Tags',
      multiple: true,
      value: ['b', 'c'],
      options: [
        { value: 'a', label: 'Alpha' },
        { value: 'b', label: 'Beta' },
        { value: 'c', label: 'Gamma' },
      ],
    }),
  )
  assert.match(html, /aria-multiselectable="true"/)
  assert.deepEqual(attributes(html, 'aria-selected'), ['false', 'true', 'true'])
  // Not on a selected option: with several chosen there is no single
  // answer to land on, so the stop is where the arrows left off.
  assert.deepEqual(attributes(html, 'tabindex'), ['0', '-1', '-1'])
})

test('a tree announces the depth that the indentation only shows', () => {
  const html = renderToStaticMarkup(
    createElement(HozoTree, {
      accessibilityLabel: 'Files',
      defaultExpanded: ['src'],
      nodes: [
        {
          id: 'src',
          label: 'src',
          children: [
            { id: 'index', label: 'index.ts' },
            { id: 'lib', label: 'lib', children: [{ id: 'util', label: 'util.ts' }] },
          ],
        },
        { id: 'readme', label: 'README.md' },
      ],
    }),
  )
  assert.match(html, /role="tree"/)
  assert.equal(attributes(html, 'role').filter((role) => role === 'treeitem').length, 4)
  // Without these the tree renders identically and announces as a flat
  // list: the depth lives in the CSS, which is what a screen reader does
  // not read.
  assert.deepEqual(attributes(html, 'aria-level'), ['1', '2', '2', '1'])
  assert.deepEqual(attributes(html, 'aria-posinset'), ['1', '1', '2', '2'])
  assert.deepEqual(attributes(html, 'aria-setsize'), ['2', '2', '2', '2'])
})

test('only a branch of the tree says whether it is open', () => {
  const html = renderToStaticMarkup(
    createElement(HozoTree, {
      accessibilityLabel: 'Files',
      nodes: [
        { id: 'src', label: 'src', children: [{ id: 'index', label: 'index.ts' }] },
        { id: 'readme', label: 'README.md' },
      ],
    }),
  )
  // One `aria-expanded`, on the branch. A leaf carrying one tells a screen
  // reader it can be opened, which it cannot.
  assert.deepEqual(attributes(html, 'aria-expanded'), ['false'])
  // And the collapsed branch's child is not rendered at all, which is what
  // makes the rows "what is on screen".
  assert.doesNotMatch(html, /index\.ts/)
})
