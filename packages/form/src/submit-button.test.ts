/**
 * What a rendered submit button is. Enter submitting a form with several fields
 * is the browser's, and only a real `type="submit"` gets it -- so the element is
 * what is asserted here.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { Form, SubmitButton } from './index.ts'

const button = (props: Record<string, unknown> = {}) => {
  const html = renderToStaticMarkup(createElement(SubmitButton, props, 'Save'))
  const tag = html.match(/<button[^>]*>/)?.[0]
  assert.ok(tag, html)
  return { html, tag }
}

test('it is a real submit button, inside the form it submits', () => {
  const html = renderToStaticMarkup(
    createElement(
      Form,
      { accessibilityLabel: 'Rename' },
      createElement('input', { name: 'first' }),
      createElement('input', { name: 'second' }),
      createElement(SubmitButton, null, 'Save'),
    ),
  )
  assert.match(html, /<form[^>]*>.*<button[^>]* type="submit"[^>]*>Save<\/button><\/form>/, html)
})

test('disabled is the same five things Button means by it', () => {
  const { tag } = button({ disabled: true })
  assert.match(tag, / disabled=""/)
  assert.match(tag, / data-hozo-disabled=""/)
  assert.match(tag, / aria-disabled="true"/)
  assert.doesNotMatch(tag, /data-hozo-pressable/)
  assert.match(button().tag, / data-hozo-pressable=""/)
})

test('names, hints and ids are spelled the way Button spells them', () => {
  const { tag } = button({
    accessibilityLabel: 'Save changes',
    accessibilityHint: 'Needs a name first',
    testID: 'save',
    nativeID: 'save-button',
    className: 'px-4',
  })
  assert.match(tag, / aria-label="Save changes"/)
  assert.match(tag, / aria-description="Needs a name first"/)
  assert.match(tag, / data-testid="save"/)
  assert.match(tag, / id="save-button"/)
  assert.match(tag, / class="px-4"/)
})

test('a Tooltip can make it a trigger, and nothing else is forwarded', () => {
  const { tag } = button({ 'aria-describedby': 'tip', title: 'not a prop' })
  assert.match(tag, / aria-describedby="tip"/)
  assert.doesNotMatch(tag, /title=/)
})
