import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { HozoTouchableWithoutFeedback } from './touchable-without-feedback.ts'

test('clones the only child instead of introducing a layout wrapper', () => {
  const html = renderToStaticMarkup(
    createElement(
      HozoTouchableWithoutFeedback,
      {
        accessibilityHint: 'Shows details',
        accessibilityLabel: 'Learn more',
        accessibilityRole: 'button',
        accessibilityState: { expanded: false },
        nativeID: 'learn-control',
        tabIndex: 0,
        testID: 'learn',
      },
      createElement('span', { className: 'label' }, 'Learn'),
    ),
  )

  assert.equal(html.match(/<span/g)?.length, 1)
  assert.match(html, /^<span/)
  assert.match(html, /class="label"/)
  assert.match(html, /role="button"/)
  assert.match(html, /tabindex="0"/)
  assert.match(html, /aria-label="Learn more"/)
  assert.match(html, /aria-description="Shows details"/)
  assert.match(html, /aria-expanded="false"/)
  assert.match(html, /data-testid="learn"/)
  assert.match(html, /id="learn-control"/)
})

test('disabled removes activation from the cloned child', () => {
  const html = renderToStaticMarkup(
    createElement(
      HozoTouchableWithoutFeedback,
      { disabled: true, onClick: () => {} },
      createElement('div'),
    ),
  )
  assert.match(html, /aria-disabled="true"/)
  assert.match(html, /data-hozo-disabled=""/)
})
