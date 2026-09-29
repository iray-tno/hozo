/**
 * The two ways a menu's class lists can be wrong without looking wrong.
 *
 * The trigger is a plain `<button>` rendered by the pattern, not the `Button`
 * primitive, so a `disabled:` class on it would compile to
 * `[data-hozo-disabled]` -- an attribute this element never carries -- and
 * style nothing while reading as though it did. And the floating panel already
 * has `z-50` from the positioner, so a second z-index inside it is a number
 * nobody can reason about against the first.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { Menu, type MenuItem } from './index.ts'

const ITEMS: MenuItem[] = [
  { label: 'Rename' },
  { label: 'Duplicate' },
  { label: 'Delete', disabled: true },
]

const render = () =>
  renderToStaticMarkup(
    createElement(Menu, { trigger: 'Actions', items: ITEMS, accessibilityLabel: 'Actions' }),
  )

const source = readFileSync(path.join(import.meta.dirname, '..', 'src', 'menu.tsx'), 'utf8')

test('the trigger is a button the pattern renders, wearing the neutral look', () => {
  const html = render()
  assert.match(html, /<button[^>]*aria-haspopup="menu"/)
  assert.match(html, /aria-expanded="false"/)
  assert.match(html, /border-hozo-border-strong/)
})

test('no disabled: class on the trigger, because nothing sets the attribute it needs', () => {
  const trigger = /const trigger =\s*\n?\s*'([^']*)'/.exec(source)?.[1] ?? ''
  assert.ok(trigger.length > 0, 'the trigger class list was not found')
  // Not `\bdisabled:`, which matches inside `aria-disabled:` -- the character
  // before it is a hyphen, and a hyphen is a word boundary.
  assert.doesNotMatch(trigger, /(^|\s)disabled:/)
  assert.match(trigger, /focus-visible:outline-hozo-focus/)
})

test('the panel carries no z-index of its own', () => {
  const panel = /const panel =\s*\n?\s*'([^']*)'/.exec(source)?.[1] ?? ''
  assert.ok(panel.length > 0, 'the panel class list was not found')
  assert.doesNotMatch(panel, /\bz-\d/)
})

test('a disabled item is aria-disabled, which is what the dimming hangs off', () => {
  // Closed by default, so this reads the class list rather than the markup --
  // the items do not exist until the menu opens, which is the pattern's
  // business and is covered where it lives.
  const item = /const item =\s*\n?\s*'([^']*)'/.exec(source)?.[1] ?? ''
  assert.match(item, /aria-disabled:text-hozo-text-subtle/)
  assert.doesNotMatch(item, /(^|\s)disabled:/)
})
