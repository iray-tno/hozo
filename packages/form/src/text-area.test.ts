/**
 * What a rendered field is, and what is not reachable here.
 *
 * The growing needs a layout, which `renderToStaticMarkup` does not have: no
 * `scrollHeight`, no computed style, no effect. That is the reason the arithmetic
 * is in `text-area-rules.ts` and tested there against numbers, and the reason
 * this file asserts the thing a server render *can* settle -- that the first
 * paint is already the right number of rows tall, before any measurement.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { TextArea } from './index.ts'

const render = (props: Record<string, unknown>) =>
  renderToStaticMarkup(createElement(TextArea, { accessibilityLabel: 'Notes', ...props }))

test('the field is a textarea with a name', () => {
  const html = render({})
  assert(html.includes('<textarea'))
  assert(html.includes('aria-label="Notes"'))
})

test('the first paint is already minRows tall, with no measurement', () => {
  // `rows` rather than a height, so the server-rendered field does not jump when
  // the first measurement lands.
  assert(render({}).includes('rows="2"'))
  assert(render({ minRows: 5 }).includes('rows="5"'))
  // An explicit `rows` wins, for a caller who wants the two to differ.
  assert(render({ minRows: 5, rows: 3 }).includes('rows="3"'))
})

test('a name comes from one place at a time', () => {
  const html = render({ accessibilityLabelledBy: 'notes-label' })
  assert(html.includes('aria-labelledby="notes-label"'))
  assert(!html.includes('aria-label='))
})

test('with no limit there is no counter and nothing describes the field', () => {
  const html = render({})
  assert(!html.includes('aria-describedby'))
  assert(!html.includes('<span'))
})

test('a limit renders a counter and points the field at it', () => {
  const html = render({ maxLength: 120, defaultValue: 'Hello' })
  assert(html.includes('115 of 120 characters left'))
  const described = /aria-describedby="([^"]+)"/.exec(html)
  assert(described, 'the field has a description')
  const id = described[1] as string
  // The id it names is really in the document, which is the failure mode an
  // `aria-describedby` has: a reader says nothing and nothing looks wrong.
  assert(html.includes(`id="${id}"`))
})

test('a caller description is read before the count', () => {
  const html = render({ maxLength: 20, 'aria-describedby': 'notes-help' })
  const described = /aria-describedby="([^"]+)"/.exec(html)
  assert(described)
  const ids = (described[1] as string).split(' ')
  // A limit is the less important of the two, so it goes second.
  assert.equal(ids[0], 'notes-help')
  assert.equal(ids.length, 2)
})

test('the count is formattable, because "characters left" is English', () => {
  const html = render({
    maxLength: 20,
    defaultValue: 'ab',
    formatCount: (remaining: number) => `あと${remaining}文字`,
  })
  assert(html.includes('あと18文字'))
})

test('disabled is written twice, for CSS and for the platform', () => {
  const html = render({ disabled: true })
  // `disabled:` compiles to `[data-hozo-disabled]` (decision 001), so a package
  // that only set the real attribute would style nothing.
  assert(html.includes('data-hozo-disabled'))
  assert(html.includes('disabled='))
})

test('the attributes a Field hands over are the only spelling of them', () => {
  // No `invalid` or `required` prop beside these, for the reason `Input` records:
  // two props meaning one thing is a field that looks fine and announces itself
  // as wrong. Spreading a `Field`'s control has to just work.
  const html = render({ 'aria-invalid': true, 'aria-required': true })
  assert(html.includes('aria-invalid="true"'))
  assert(html.includes('aria-required="true"'))
  // The real `required` attribute is deliberately absent: `Field` uses
  // `aria-required`, so the browser's own validation bubble gets no say in when a
  // form submits.
  assert(!/ required/.test(html))
  assert(!render({}).includes('aria-invalid'))
})

test('nothing carries a class it was not given', () => {
  assert(!render({ maxLength: 10 }).includes('class='))
})
