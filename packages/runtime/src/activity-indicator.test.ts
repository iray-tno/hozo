import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { HozoActivityIndicator } from './activity-indicator.ts'

test('renders an indeterminate progressbar at React Native sizes', () => {
  const html = renderToStaticMarkup(
    createElement(HozoActivityIndicator, {
      'aria-label': 'Loading posts',
      color: 'tomato',
      size: 'large',
    }),
  )

  assert.match(html, /role="progressbar"/)
  assert.match(html, /aria-label="Loading posts"/)
  assert.match(html, /width="36"/)
  assert.match(html, /stroke="tomato"/)
  assert.match(html, /animation-name:hozo-activity-indicator-spin/)
})

test('a stopped indicator pauses and follows hidesWhenStopped', () => {
  const hidden = renderToStaticMarkup(
    createElement(HozoActivityIndicator, { animating: false, size: 12 }),
  )
  assert.match(hidden, /width="12"/)
  assert.match(hidden, /animation-play-state:paused/)
  assert.match(hidden, /visibility:hidden/)

  const visible = renderToStaticMarkup(
    createElement(HozoActivityIndicator, { animating: false, hidesWhenStopped: false }),
  )
  assert.match(visible, /visibility:visible/)
})
