/**
 * The look, which is all `Field` adds here; the wiring is `@hozo/form`'s and
 * is tested there.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { Field, type FieldControl, type FieldProps } from './index.ts'

const render = (props: Partial<FieldProps> = {}) =>
  renderToStaticMarkup(
    createElement(Field, {
      label: 'Email',
      children: (control: FieldControl) => createElement('input', { type: 'email', ...control }),
      ...props,
    } as FieldProps),
  )

test('the caller’s classes join the package’s rather than replacing them', () => {
  // A component that let `className` win would lose its own layout the first
  // time somebody wanted a margin.
  const html = render({ className: 'MINE', labelClassName: 'LABEL' })
  assert.match(html, /class="flex flex-col gap-2 MINE"/)
  assert.match(html, /class="[^"]*text-hozo-text LABEL"/)
})

test('the wiring still reaches the control through the look', () => {
  const html = render({ required: true, error: 'That is not an email.' })
  assert.match(html, /<label for="([^"]*)"[\s\S]*<input[^>]* id="\1"/)
  assert.match(html, /aria-invalid="true"/)
  assert.match(html, /class="text-hozo-danger"/)
})
