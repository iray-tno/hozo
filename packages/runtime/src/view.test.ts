import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { HozoView } from './view.ts'

test('normalizes Native-shaped View props onto one DOM element', () => {
  const html = renderToStaticMarkup(
    createElement(
      HozoView,
      {
        accessibilityHint: 'Contains account settings',
        accessibilityLabel: 'Settings',
        accessibilityRole: 'region',
        accessibilityState: { busy: true },
        nativeID: 'settings',
        pointerEvents: 'box-none',
        style: [{ padding: 4 }, { padding: 12 }],
        testID: 'settings-view',
      },
      'Account',
    ),
  )

  assert.match(html, /^<div/)
  assert.match(html, /role="region"/)
  assert.match(html, /aria-label="Settings"/)
  assert.match(html, /aria-description="Contains account settings"/)
  assert.match(html, /aria-busy="true"/)
  assert.match(html, /data-testid="settings-view"/)
  assert.match(html, /data-hozo-pointer-events="box-none"/)
  assert.match(html, /id="settings"/)
  assert.match(html, /padding:12px/)
})
