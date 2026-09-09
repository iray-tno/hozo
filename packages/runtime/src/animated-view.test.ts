import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { HozoAnimatedView } from './animated-view.ts'

test('Animated.View resolves Animated-compatible nodes before DOM style normalization', () => {
  const half = {
    __getValue: () => 0.5,
    addListener: () => 'listener',
    removeListener() {},
  }
  const html = renderToStaticMarkup(
    createElement(HozoAnimatedView, {
      style: [{ opacity: half }, { transform: [{ scale: half }] }],
    }),
  )

  assert.match(html, /^<div/)
  assert.match(html, /opacity:0.5/)
  assert.match(html, /transform:scale\(0.5\)/)
  assert.doesNotMatch(html, /__getValue/)
})
