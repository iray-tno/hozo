/**
 * The ring, the dot, and the space they sit in.
 *
 * These options are `<div role="radio">`, so there is no browser-drawn control
 * and no `:checked` to select -- the whole appearance is two decorative slots
 * positioned over the row. Which makes the padding that keeps them off the
 * label part of the drawing rather than decoration: take `ps-9` away and the
 * dot lands on the first letter of every option. That is a layout bug nothing
 * else here would catch, so it is asserted.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { RadioGroup, type RadioOption } from './index.ts'

const OPTIONS: RadioOption<string>[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'express', label: 'Express' },
  { value: 'pigeon', label: 'By pigeon', disabled: true },
]

const render = (props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(RadioGroup, {
      options: OPTIONS,
      accessibilityLabel: 'Shipping',
      defaultValue: 'express',
      ...props,
    }),
  )

const options = (html: string): string[] =>
  [...html.matchAll(/<div[^>]*role="radio"[^>]*>.*?<\/div>/g)].map((found) => found[0])

test('the dot is drawn from aria-checked, which is the only state there is', () => {
  const html = render()
  const chosen = options(html).filter((tag) => tag.includes('aria-checked="true"'))
  assert.equal(chosen.length, 1, 'one option is chosen')
  assert.match(chosen[0] ?? '', /aria-hidden="true"/)
  assert.match(chosen[0] ?? '', /size-2 rounded-full bg-hozo-accent/)
  assert.doesNotMatch(html, /before:|after:/)
  // No `:checked` anywhere: there is no input to match it, which is the same
  // reason `disabled:` compiles to an attribute selector in this project.
  // Not `\bchecked:`, which matches inside `aria-checked:`: the character
  // before it is a hyphen, and a hyphen is a word boundary.
  assert.doesNotMatch(html, /(^|\s|")checked:/)
})

test('the row reserves the space its decorative slots are drawn in', () => {
  // `ps-9` against a 16px ring at `start-2`. Without it the ring and the dot
  // are drawn over the label -- both are absolutely positioned, so nothing
  // pushes the text out of the way.
  const [first] = options(render())
  assert.match(first ?? '', /\bps-9\b/)
  assert.match(first ?? '', /start-2 top-3/)
  assert.match(first ?? '', /items-center justify-center/)
})

test('a disabled option is aria-disabled and dims its ring', () => {
  const off = options(render()).filter((tag) => tag.includes('aria-disabled="true"'))
  assert.equal(off.length, 1)
  assert.match(off[0] ?? '', /rounded-full border-2 border-hozo-border bg-hozo-surface/)
})

test('the group is a column by default and a row when asked', () => {
  assert.match(render(), /role="radiogroup"[^>]*class="[^"]*flex-col/)
  assert.match(render({ orientation: 'horizontal' }), /role="radiogroup"[^>]*class="[^"]*flex-row/)
})
