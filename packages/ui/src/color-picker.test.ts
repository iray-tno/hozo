import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ColorPicker } from './color-picker.tsx'

const thumbs = (props: Record<string, unknown>) =>
  [
    ...renderToStaticMarkup(
      createElement(ColorPicker, { accessibilityLabel: 'Color', ...props }),
    ).matchAll(/<div[^>]*role="slider"[^>]*>/g),
  ].map(([tag]) => tag)

test('light and dark selections choose contrasting borders with the opposite outer edge', () => {
  const light = thumbs({ defaultValue: '#ffffff' })
  assert.equal(light.length, 3)
  for (const thumb of light) {
    assert.match(thumb, /border-hozo-marker-on-light/)
    assert.match(thumb, /outline-hozo-marker-on-dark/)
    assert.match(thumb, /focus-visible:outline-hozo-focus/)
  }
  const dark = thumbs({ defaultValue: '#000000' })
  assert.match(dark[0]!, /border-hozo-marker-on-light/, 'hue still sits on red, not selected black')
  for (const thumb of dark.slice(1)) {
    assert.match(thumb, /border-hozo-marker-on-dark/)
    assert.match(thumb, /outline-hozo-marker-on-light/)
  }
})

test('alpha keeps a two-tone edge and callers can replace the value-dependent look', () => {
  const alpha = thumbs({ defaultValue: '#ffffff00', alpha: true }).at(-1)!
  assert.match(alpha, /outline-hozo-marker-on-dark/)
  assert.match(alpha, /border-hozo-marker-on-light/)
  const custom = thumbs({
    defaultValue: '#ffffff',
    thumbClassName: 'caller-thumb',
    thumbLook: () => ({ className: 'caller-value-look' }),
  })
  for (const thumb of custom) {
    assert.match(thumb, /caller-thumb/)
    assert.match(thumb, /caller-value-look/)
    assert.doesNotMatch(thumb, /border-hozo-marker/)
  }
})

test('thumbs centre with logical inline-start margin rather than a physical horizontal translation', () => {
  for (const thumb of thumbs({ defaultValue: '#ffff00', alpha: true })) {
    assert.match(thumb, /\s-ms-3\s/)
    assert.match(thumb, /\bsize-6\b/)
    assert.doesNotMatch(thumb, /-translate-x-1\/2/)
  }
})
