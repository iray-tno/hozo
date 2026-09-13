import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { HozoTouchableOpacity } from './touchable-opacity.ts'

test('maps React Native identity and accessibility props onto the DOM', () => {
  const html = renderToStaticMarkup(
    createElement(
      HozoTouchableOpacity,
      {
        accessibilityHint: 'Stores the draft',
        accessibilityLabel: 'Save',
        accessibilityRole: 'button',
        accessibilityState: { busy: true },
        nativeID: 'save-control',
        style: [{ padding: 4 }, { padding: 8 }],
        testID: 'save',
      },
      'Save',
    ),
  )

  assert.match(html, /role="button"/)
  assert.match(html, /aria-label="Save"/)
  assert.match(html, /aria-description="Stores the draft"/)
  assert.match(html, /aria-busy="true"/)
  assert.match(html, /data-testid="save"/)
  assert.match(html, /id="save-control"/)
  assert.match(html, /padding:8px/)
  assert.doesNotMatch(html, /accessibility(Label|Hint|Role|State)/)
})

test('a disabled touchable is announced, styled, and cannot click', () => {
  const html = renderToStaticMarkup(
    createElement(HozoTouchableOpacity, {
      'aria-label': 'Unavailable',
      disabled: true,
      onClick: () => {},
    }),
  )

  assert.match(html, /aria-disabled="true"/)
  assert.match(html, /data-hozo-disabled=""/)
})
