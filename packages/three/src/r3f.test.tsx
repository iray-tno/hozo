import assert from 'node:assert/strict'
import test from 'node:test'
import { createRef } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Group } from 'three'

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

test('registered actions and destinations become native semantic controls', () => {
  const object = new Group()
  const objectRef = createRef<Group>()
  objectRef.current = object
  const html = renderToStaticMarkup(
    <ThreeCanvas
      accessibilityLabel="Product model"
      accessibleObjects={[
        {
          id: 'inspect',
          label: 'Inspect product',
          object: objectRef,
          onPress: () => undefined,
          testID: 'inspect-product',
        },
        {
          id: 'details',
          label: 'Product details',
          object,
          href: '/products/42',
          replace: true,
          testID: 'product-details',
        },
        {
          id: 'hidden',
          label: 'Unavailable option',
          object,
          disabled: true,
          onPress: () => undefined,
        },
      ]}
    />,
  )

  assert.match(html, /data-hozo-three-controls=""/)
  assert.match(
    html,
    /<button data-testid="inspect-product" type="button">Inspect product<\/button>/,
  )
  assert.match(
    html,
    /<a data-testid="product-details" href="\/products\/42" data-hozo-navigation-replace="">Product details<\/a>/,
  )
  assert.doesNotMatch(html, /Unavailable option/)
})
