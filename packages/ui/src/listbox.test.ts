/**
 * Whether the chosen row says so by more than its colour.
 *
 * WCAG 1.4.1: colour is not to be the only visual means of conveying
 * information. A listbox is where that is easiest to get wrong, because a pale
 * tint on the selected row looks finished -- and is invisible on a monochrome
 * display, to a colour-blind reader, and in print. axe cannot find this: the
 * contrast rule checks whether text is readable, not whether two rows differ
 * for a reason.
 *
 * So it is a source-level assertion, like the focus-ring rule in
 * `tokens.test.ts`, and for the same reason: what can go wrong is the class
 * list, and no rendering shows it.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { Listbox, type ListboxOption } from './index.ts'

const OPTIONS: ListboxOption<string>[] = [
  { value: 'rust', label: 'Rust' },
  { value: 'ts', label: 'TypeScript' },
  { value: 'cobol', label: 'COBOL', disabled: true },
]

const render = (props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(Listbox, {
      options: OPTIONS,
      accessibilityLabel: 'Language',
      defaultValue: 'ts',
      ...props,
    }),
  )

const chosenTag = (html: string): string => {
  const found = /<div[^>]*aria-selected="true"[^>]*>/.exec(html)
  assert.ok(found, 'nothing is selected')
  return found[0]
}

test('the chosen row changes something that is not a colour', () => {
  const tag = chosenTag(render())
  assert.match(tag, /aria-selected:bg-hozo-accent-subtle/, 'the tint')
  assert.match(tag, /aria-selected:font-semibold/, 'and the part that survives without colour')
})

test('the box scrolls rather than growing past the page', () => {
  // More options than fit is the normal case. The pattern moves focus with the
  // arrows and the browser scrolls a focused element into view, so the
  // keyboard and the pointer agree without this file arranging it.
  const html = render()
  assert.match(html, /role="listbox"[^>]*class="[^"]*overflow-y-auto/)
  assert.match(html, /role="listbox"[^>]*class="[^"]*max-h-60/)
})

test('a multi-select listbox is the same look and says so in the markup', () => {
  // The discriminated union survives the styling wrapper: `multiple` still
  // takes an array, and `aria-multiselectable` still reaches the element.
  const html = render({ multiple: true, defaultValue: ['rust', 'ts'] })
  assert.match(html, /aria-multiselectable="true"/)
  assert.equal(html.match(/aria-selected="true"/g)?.length, 2)
})
