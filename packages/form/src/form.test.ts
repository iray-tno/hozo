/**
 * What a rendered form is.
 *
 * The submission is not reachable here -- `renderToStaticMarkup` has no events,
 * no `requestSubmit` and no focus -- which is why the decision inside it lives in
 * `form-rules.ts` and is tested there as two functions over plain records. What
 * is left for this file is the element and the name, and the name is the whole
 * reason to use a `<form>` rather than a `<div>`: an unnamed form is not a
 * landmark, so a screen reader has nothing to list.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { Form } from './index.ts'

const render = (props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(
      Form,
      { accessibilityLabel: 'Delivery', ...props },
      createElement('input', { name: 'street' }),
    ),
  )

test('it is a real form element with a name', () => {
  const html = render()
  assert(html.startsWith('<form'))
  assert(html.includes('aria-label="Delivery"'))
  assert(html.includes('<input'))
})

test('a name comes from one place at a time', () => {
  const html = render({ accessibilityLabelledBy: 'delivery-heading' })
  assert(html.includes('aria-labelledby="delivery-heading"'))
  assert(!html.includes('aria-label='))
})

test('the platform validation is left switched on', () => {
  // No `noValidate`. `Field` marks its control with `aria-required` rather than
  // `required`, so the browser has nothing to catch unless the application added
  // a real constraint -- and silently disabling the feature it reached for is not
  // this component's decision.
  assert(!render().includes('novalidate'))
})

test('nothing carries a class or a test id it was not given', () => {
  assert(!render().includes('class='))
  assert(!render().includes('data-testid'))
  assert(render({ className: 'grid', testID: 'delivery' }).includes('class="grid"'))
  assert(render({ testID: 'delivery' }).includes('data-testid="delivery"'))
})
