import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { HozoTextInput } from './text-input.ts'

test('value-level TextInput maps the React Native field contract onto the DOM', () => {
  const html = renderToStaticMarkup(
    createElement(HozoTextInput, {
      accessibilityHint: 'Use your public name',
      accessibilityLabel: 'Display name',
      editable: false,
      keyboardType: 'email-address',
      nativeID: 'display-name',
      style: [{ padding: 4 }, { padding: 8 }],
      testID: 'profile-name',
      value: 'Ada',
    }),
  )

  assert.match(html, /^<input/)
  assert.match(html, /aria-label="Display name"/)
  assert.match(html, /aria-description="Use your public name"/)
  assert.match(html, /data-testid="profile-name"/)
  assert.match(html, /id="display-name"/)
  assert.match(html, /inputMode="email"/)
  assert.match(html, /readOnly=""/)
  assert.match(html, /padding:8px/)
})

test('a multiline TextInput becomes a textarea with rows', () => {
  const html = renderToStaticMarkup(
    createElement(HozoTextInput, {
      accessibilityLabel: 'Biography',
      multiline: true,
      numberOfLines: 4,
    }),
  )
  assert.match(html, /^<textarea/)
  assert.match(html, /rows="4"/)
})
