import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { HozoPressable } from './pressable.ts'

test('value-level Pressable renders callback children and native-shaped props', () => {
  const html = renderToStaticMarkup(
    createElement(
      HozoPressable,
      {
        accessibilityLabel: 'Save draft',
        accessibilityRole: 'button',
        dataSet: { intent: 'save' },
        onPress() {},
        style: ({ pressed }) => [{ padding: 4 }, pressed && { opacity: 0.5 }],
      },
      ({ hovered, pressed }) => `${hovered}:${pressed}`,
    ),
  )

  assert.match(html, /^<div/)
  assert.match(html, /role="button"/)
  assert.match(html, /aria-label="Save draft"/)
  assert.match(html, /data-intent="save"/)
  assert.match(html, /tabindex="0"/)
  assert.match(html, /padding:4px/)
  assert.match(html, />false:false<\/div>$/)
})

test('a destination-bearing Pressable remains a semantic anchor', () => {
  const html = renderToStaticMarkup(
    createElement(HozoPressable, { external: true, href: 'https://example.com' }, 'Docs'),
  )
  assert.match(html, /^<a/)
  assert.match(html, /href="https:\/\/example.com"/)
  assert.match(html, /target="_blank"/)
  assert.match(html, /rel="noreferrer noopener"/)
})

test('disabled removes activation and exposes both accessibility and styling state', () => {
  const html = renderToStaticMarkup(
    createElement(HozoPressable, { accessibilityRole: 'button', disabled: true, onPress() {} }),
  )
  assert.match(html, /aria-disabled="true"/)
  assert.match(html, /data-hozo-disabled=""/)
  assert.match(html, /tabindex="-1"/)
})
