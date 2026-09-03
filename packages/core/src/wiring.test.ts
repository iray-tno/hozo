import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import {
  HozoCombobox,
  HozoListbox,
  HozoMenu,
  HozoRadioGroup,
  HozoTabs,
  type HozoTabsProps,
  HozoToolbar,
  HozoTree,
} from './index.tsx'

const tabs = [
  { label: 'Profile', content: 'profile' },
  { label: 'Billing', content: 'billing' },
  { label: 'Closed', content: 'closed', disabled: true },
]

const strip = (props: Partial<HozoTabsProps> = {}) =>
  renderToStaticMarkup(createElement(HozoTabs, { tabs, accessibilityLabel: 'Account', ...props }))

function attributes(html: string, name: string): string[] {
  return [...html.matchAll(new RegExp(`${name}="([^"]*)"`, 'g'))].map((match) => match[1] ?? '')
}

test('a tab points at its panel and the panel back at the tab', () => {
  const html = strip()
  const ids = attributes(html, 'id')
  const tabIds = ids.filter((id) => id.includes('-tab-'))
  const panelIds = ids.filter((id) => id.includes('-panel-'))

  assert.equal(tabIds.length, 3)
  assert.deepEqual(attributes(html, 'aria-controls'), panelIds, 'each tab points at its panel')
  assert.deepEqual(attributes(html, 'aria-labelledby'), tabIds, 'each panel points back at its tab')
})

test('a disabled tab keeps its place and says so', () => {
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
  assert.doesNotMatch(html, /aria-controls/)
  assert.doesNotMatch(html, /role="menu"/)
})

test('the toolbar is one tab stop and says which way it goes', () => {
  const html = renderToStaticMarkup(
    createElement(HozoToolbar, {
      accessibilityLabel: 'Formatting',
      items: [
        { render: (props: any) => createElement('button', { ...props, key: 'b' }, 'B') },
        { render: (props: any) => createElement('button', { ...props, key: 'i' }, 'I') },
        { render: (props: any) => createElement('button', { ...props, key: 'u' }, 'U') },
      ],
    }),
  )
  assert.match(html, /role="toolbar"/)
  const stops = attributes(html, 'tabindex')
  assert.deepEqual(stops, ['0', '-1', '-1'], 'twelve buttons should be one Tab, not twelve')
})

test('the radio group puts its tab stop on the chosen option', () => {
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
  assert.deepEqual(attributes(html, 'aria-expanded'), ['false'])
  assert.doesNotMatch(html, /index\.ts/)
})

test('the combobox field keeps focus and names the option instead', () => {
  const html = renderToStaticMarkup(
    createElement(HozoCombobox, {
      accessibilityLabel: 'City',
      options: [
        { value: 'mad', label: 'Madrid' },
        { value: 'man', label: 'Manchester' },
      ],
    }),
  )
  assert.match(html, /role="combobox"/)
  assert.match(html, /aria-expanded="false"/)
  assert.match(html, /aria-autocomplete="list"/)
  assert.doesNotMatch(html, /aria-controls/)
  assert.doesNotMatch(html, /aria-activedescendant/)
  assert.doesNotMatch(html, /tabindex/)
})
