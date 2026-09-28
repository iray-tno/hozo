import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { Checkbox, Switch } from './index.ts'

const render = (
  component: typeof Checkbox | typeof Switch,
  // biome-ignore lint/suspicious/noExplicitAny: the two prop types differ by design
  props: any = {},
  label = 'Notify me',
) => renderToStaticMarkup(createElement(component as never, props, label))

test('a checkbox is a button with the role, so the platform gives it Space and focus', () => {
  const html = render(Checkbox)
  assert.match(html, /<button/)
  assert.match(html, /type="button"/, 'never a submit button, wherever it is put')
  assert.match(html, /role="checkbox"/)
  assert.match(html, /aria-checked="false"/)
  assert.match(html, /Notify me/, 'the label is inside it, so it is the accessible name')
  assert.doesNotMatch(html, /tabindex/i, 'the browser owns the tab stop; there is no group to rove')
})

test('a checkbox has three states and says each of them twice', () => {
  // Twice: once for a reader in `aria-checked`, once for a stylesheet in
  // `data-hozo-state`. This package ships no CSS, so the second one is how an
  // application draws a box it does not otherwise know the state of.
  for (const [checked, aria, data] of [
    [true, 'true', 'checked'],
    [false, 'false', 'unchecked'],
    ['mixed', 'mixed', 'mixed'],
  ] as const) {
    const html = render(Checkbox, { checked })
    assert.match(html, new RegExp(`aria-checked="${aria}"`), `aria for ${String(checked)}`)
    assert.match(html, new RegExp(`data-hozo-state="${data}"`), `data for ${String(checked)}`)
  }
})

test('a switch has two states, because the role has no third one', () => {
  // The difference the two controls exist to express. ARIA gives `switch` no
  // mixed value, and a reader says on/off for it rather than checked/not.
  for (const [checked, aria] of [
    [true, 'true'],
    [false, 'false'],
  ] as const) {
    const html = render(Switch, { checked })
    assert.match(html, /role="switch"/)
    assert.match(html, new RegExp(`aria-checked="${aria}"`))
  }
  assert.doesNotMatch(render(Switch, { checked: true }), /mixed/)
})

test('defaultChecked is the starting state and does not pin it', () => {
  assert.match(render(Checkbox, { defaultChecked: true }), /aria-checked="true"/)
  assert.match(render(Checkbox, { defaultChecked: 'mixed' }), /aria-checked="mixed"/)
  assert.match(render(Checkbox), /aria-checked="false"/, 'and false when nothing was said')
})

test('a disabled control is disabled to the platform, not only to a reader', () => {
  // `disabled` on a `<button>` takes it out of the tab order and stops the
  // click, which `aria-disabled` alone would not -- ADR 001 asks for exactly
  // this and a checkbox is not an exception to it.
  const html = render(Checkbox, { disabled: true })
  assert.match(html, /disabled=""/)
  assert.doesNotMatch(html, /aria-disabled/, 'the real attribute, not a second opinion beside it')
})

test('accessibilityLabel replaces the name rather than joining it', () => {
  const html = render(Checkbox, { accessibilityLabel: 'Notify me by email' })
  assert.match(html, /aria-label="Notify me by email"/)
  assert.match(html, /Notify me</, 'the visible text stays visible')
})

test('neither control carries a class it was not given', () => {
  // The opt-out this package's no-CSS promise rests on: an application that
  // passes nothing gets no attribute to override.
  assert.doesNotMatch(render(Checkbox), /class=/)
  assert.doesNotMatch(render(Switch), /class=/)
  assert.match(render(Checkbox, { className: 'C' }), /class="C"/)
  assert.match(render(Switch, { className: 'S' }), /class="S"/)
})
