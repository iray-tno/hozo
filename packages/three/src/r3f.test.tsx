import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'

import { ThreeCanvas } from './r3f.tsx'

test('R3F surface exposes one labelled image envelope', () => {
  const html = renderToStaticMarkup(
    <ThreeCanvas accessibilityLabel="Product preview" style={{ width: '100%', height: 240 }} />,
  )

  assert.match(html, /data-hozo-three-r3f=""/)
  assert.match(html, /role="img"/)
  assert.match(html, /aria-label="Product preview"/)
  assert.match(html, /width:100%/)
  assert.match(html, /height:240px/)
})

test('R3F fallback is a semantic sibling of the hidden rendering surface', () => {
  const html = renderToStaticMarkup(
    <ThreeCanvas accessibilityLabel="Sales globe" accessibleFallback={<p>North America: 42</p>} />,
  )

  assert.match(html, /aria-hidden="true"/)
  assert.match(html, /data-hozo-three-fallback=""/)
  assert.match(html, /role="group"/)
  assert.match(html, /<p>North America: 42<\/p>/)
})

test('decorative R3F surfaces hide the complete envelope', () => {
  const html = renderToStaticMarkup(<ThreeCanvas decorative />)
  assert.match(html, /<div[^>]*aria-hidden="true"[^>]*data-hozo-three-r3f=""/)
  assert.doesNotMatch(html, /role="img"/)
})
