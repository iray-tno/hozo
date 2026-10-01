/**
 * The whole Web implementation, and therefore most of what can be asserted.
 *
 * There is no runtime here: one `<select>`, no portal, no focus management, no
 * measurement. So unlike every other component in this package, the server render
 * sees the finished article rather than a first paint -- which makes this file the
 * complete Web test rather than the part that fits.
 *
 * The Native half is the asymmetric one -- a presenter if provided, `ActionSheetIOS`
 * on iOS, a `BottomSheet` holding a `Listbox` elsewhere -- and none of those three
 * can be reached from here. The two reusable ones are tested where they live.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { NativeSelect, type NativeSelectOption } from './index.ts'

const COURIERS: NativeSelectOption[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'express', label: 'Express' },
  { value: 'pigeon', label: 'By pigeon', disabled: true },
]

const render = (props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(NativeSelect, {
      options: COURIERS,
      accessibilityLabel: 'Courier',
      ...props,
    }),
  )

test('it is a real select with real options', () => {
  const html = render({ defaultValue: 'express' })
  assert(html.startsWith('<select'))
  assert(html.includes('aria-label="Courier"'))
  assert.equal([...html.matchAll(/<option/g)].length, 3)
  assert(html.includes('>Express</option>'))
})

test('the chosen option is the selected one', () => {
  // React renders the selection on the `<select>`, not as an attribute on the
  // option, which is worth pinning: a test looking for `selected` would pass on a
  // component that had quietly stopped being controlled.
  assert(render({ value: 'express' }).includes('value="express"'))
})

test('a disabled option is disabled rather than missing', () => {
  // Left in and marked, because a list that drops what cannot be chosen is a list
  // whose length changes for reasons the person cannot see.
  const html = render()
  assert(html.includes('disabled=""'))
  assert(html.includes('By pigeon'))
})

test('a placeholder is an empty-valued option that can be chosen again', () => {
  const html = render({ placeholder: 'Choose a courier' })
  // `selected` is in there too, because nothing is chosen and the empty option is
  // what matches -- so the first paint already shows the placeholder rather than
  // the first real option, which is the bug a `<select>` with no empty option has.
  assert.match(html, /<option value="" selected="">Choose a courier<\/option>/)
  // Not disabled and not hidden: a placeholder that cannot be reselected is a
  // field that cannot be cleared, and whether empty is allowed belongs to
  // `aria-required` and the application.
  assert(!/<option value=""[^>]*disabled/.test(html))
})

test('with no placeholder there is no empty option', () => {
  assert(!render().includes('<option value="">'))
})

test('a name comes from one place at a time', () => {
  const html = render({ accessibilityLabelledBy: 'courier-label' })
  assert(html.includes('aria-labelledby="courier-label"'))
  assert(!html.includes('aria-label='))
})

test('the attributes a Field hands over are carried', () => {
  const html = render({
    'aria-describedby': 'courier-help',
    'aria-invalid': true,
    'aria-required': true,
  })
  assert(html.includes('aria-describedby="courier-help"'))
  assert(html.includes('aria-invalid="true"'))
  assert(html.includes('aria-required="true"'))
})

test('disabled is written twice, for CSS and for the platform', () => {
  const html = render({ disabled: true })
  // `disabled:` compiles to `[data-hozo-disabled]` (decision 001), so a real
  // `<select disabled>` on its own would be styled by nothing.
  assert(html.includes('data-hozo-disabled'))
  assert(html.includes('disabled=""'))
})

test('the form plumbing is passed through, because a select is a form control', () => {
  const html = render({ name: 'courier', id: 'courier-field' })
  assert(html.includes('name="courier"'))
  assert(html.includes('id="courier-field"'))
})

test('nothing carries a class it was not given', () => {
  assert(!render().includes('class='))
})
