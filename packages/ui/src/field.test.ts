/**
 * The wiring, which is what `Field` is.
 *
 * Every assertion here is about two elements agreeing on an id. That is the
 * class of bug the component exists to prevent, it is invisible in a
 * screenshot, and it is the one thing in this package that a reading of the
 * source does not settle -- the ids are generated, so only a render shows
 * whether they match.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { Field, type FieldControl, type FieldProps } from './index.ts'

/** A field wrapped round a plain input, which is what most of them are. */
const render = (props: Partial<FieldProps> = {}) =>
  renderToStaticMarkup(
    createElement(Field, {
      label: 'Email',
      children: (control: FieldControl) => createElement('input', { type: 'email', ...control }),
      ...props,
    } as FieldProps),
  )

/** The value of one attribute, or null when it is absent. */
const attribute = (html: string, name: string): string | null =>
  new RegExp(`${name}="([^"]*)"`).exec(html)?.[1] ?? null

test('the label points at the control, so pressing it focuses the control', () => {
  const html = render()
  const forId = attribute(html, 'for')
  const id = attribute(html, 'id')
  assert.ok(forId, 'the label has a for')
  assert.equal(forId, id, 'and it is the id the control was given')
  assert.match(html, /<label/)
})

test('a field with nothing to say says nothing', () => {
  // No description and no error means no `aria-describedby` at all, rather
  // than one pointing at an element that is not there -- which is a reader
  // following a reference into nothing.
  const html = render()
  assert.equal(attribute(html, 'aria-describedby'), null)
  assert.doesNotMatch(html, /aria-invalid/)
  assert.doesNotMatch(html, /aria-required/)
  assert.doesNotMatch(html, /role="alert"/)
})

test('a description is named by the control and exists to be named', () => {
  const html = render({ description: 'We never share it.' })
  const describedBy = attribute(html, 'aria-describedby')
  assert.ok(describedBy)
  assert.match(html, new RegExp(`id="${describedBy}"`), 'the id it names is in the markup')
  assert.match(html, /We never share it\./)
})

test('an error is what makes the field invalid, and is read first', () => {
  // The order inside `aria-describedby` is the order a reader reads them in,
  // and somebody who has just been told their input is wrong wants to know
  // why before being told the rules again.
  const html = render({ description: 'We never share it.', error: 'That is not an email.' })
  const described = attribute(html, 'aria-describedby')?.split(' ') ?? []
  assert.equal(described.length, 2)
  const errorId = /id="([^"]*)"[^>]*role="alert"/.exec(html)?.[1]
  assert.equal(described[0], errorId, 'the error comes first')
  assert.equal(attribute(html, 'aria-invalid'), 'true')
})

test('the error is announced when it appears', () => {
  // `role="alert"` rather than a container with `aria-live` that is always
  // present. The trade is written down in the component: this announces a
  // field that mounts with an error already on it, which is right for a form
  // that came back from a server.
  assert.match(render({ error: 'Required.' }), /role="alert"/)
})

test('required reaches a reader, and the asterisk does not', () => {
  // A star a reader announced as "asterisk" would be worse than one it
  // ignores, so the mark is `aria-hidden` and `aria-required` carries it.
  const html = render({ required: true })
  assert.equal(attribute(html, 'aria-required'), 'true')
  assert.match(html, /aria-hidden="true"/)
  assert.match(html, /\*/)
})

test('two fields on one page do not share an id', () => {
  // `useId` is what makes that true, and a component that built its ids from
  // the label would put two `email` fields on a page and break both.
  const html = renderToStaticMarkup(
    createElement(
      'form',
      null,
      createElement(Field, {
        label: 'Email',
        children: (c: FieldControl) => createElement('input', c),
      } as FieldProps),
      createElement(Field, {
        label: 'Email again',
        children: (c: FieldControl) => createElement('input', c),
      } as FieldProps),
    ),
  )
  const ids = [...html.matchAll(/ id="([^"]*)"/g)].map((m) => m[1])
  assert.equal(ids.length, 2)
  assert.notEqual(ids[0], ids[1])
})

test('the caller’s classes join the package’s rather than replacing them', () => {
  // A component that let `className` win would lose its own layout the first
  // time somebody wanted a margin.
  const html = render({ className: 'MINE', labelClassName: 'LABEL' })
  assert.match(html, /class="flex flex-col gap-2 MINE"/)
  assert.match(html, /class="[^"]*text-hozo-text LABEL"/)
})
