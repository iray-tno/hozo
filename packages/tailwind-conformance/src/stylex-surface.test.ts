import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  mappedHozoStylexProperties,
  officialStylexProperties,
  stylexSurface,
  stylexVersion,
} from './stylex-surface.ts'

test('StyleX publishes the property denominator used by the report', () => {
  assert.equal(stylexVersion(), '0.19.0')
  const properties = officialStylexProperties()
  assert.equal(properties.size, 522)
  for (const name of ['alignItems', 'backgroundColor', 'padding', 'transform']) {
    assert.ok(properties.has(name), `${name} should be in StyleX CSSProperties`)
  }
})

test('the StyleX numerator is the Rust frontend mapping, not a curated copy', () => {
  const mapped = mappedHozoStylexProperties()
  assert.equal(mapped.size, 170)
  for (const name of [
    'display',
    'padding',
    'backgroundColor',
    'textAlign',
    'transform',
    'transformOrigin',
    'containerName',
    'containerType',
  ]) {
    assert.ok(mapped.has(name), `${name} should have a lowering arm`)
  }
  assert.ok(!mapped.has('animationDuration'))
  assert.ok(mapped.has('scrollbarWidth'))
})

test('the universal denominator is derived from StyleX and React Native', () => {
  const surface = stylexSurface()
  assert.equal(surface.native.size, 116)
  assert.equal(surface.mappedNative.size, 116)
  assert.equal(surface.missingNative.size, 0)
  assert.ok(!surface.missingNative.has('borderWidth'))
  assert.ok(!surface.missingNative.has('pointerEvents'))
  assert.ok(!surface.missingNative.has('fontFamily'))
  assert.ok(!surface.missingNative.has('transform'))
  assert.ok(!surface.missingNative.has('transformOrigin'))
  assert.ok(!surface.missingNative.has('animationDuration'))
})

test('coverage tiers partition the published StyleX property surface', () => {
  const surface = stylexSurface()
  assert.equal(surface.contextual.size, 13)
  assert.equal(surface.mappedContextual.size, 13)
  assert.ok(surface.contextual.has('gridTemplateColumns'))
  assert.ok(surface.mappedContextual.has('gridTemplateColumns'))
  assert.ok(surface.mappedContextual.has('gridRowEnd'))
  assert.ok(surface.mappedContextual.has('transitionDuration'))
  assert.ok(surface.mappedContextual.has('transitionProperty'))
  assert.ok(surface.mappedContextual.has('transitionTimingFunction'))
  assert.ok(surface.contextual.has('transitionProperty'))
  assert.ok(surface.mappedContextual.has('containerName'))
  assert.ok(surface.mappedContextual.has('containerType'))
  assert.equal(surface.adapter.size, 1)
  assert.equal(surface.mappedAdapter.size, 0)
  assert.ok(surface.adapter.has('backdropFilter'))
  assert.equal(surface.webOnly.size, 392)
  assert.equal(surface.mappedWebOnly.size, 41)
  assert.ok(surface.mappedWebOnly.has('overscrollBehavior'))
  assert.ok(surface.mappedWebOnly.has('scrollSnapType'))
  assert.ok(surface.mappedWebOnly.has('scrollbarWidth'))
  assert.ok(surface.mappedWebOnly.has('touchAction'))
  assert.ok(surface.mappedWebOnly.has('overflowX'))
  assert.ok(surface.mappedWebOnly.has('scrollMarginInlineEnd'))
  assert.ok(surface.mappedWebOnly.has('textIndent'))
  assert.equal(
    surface.native.size + surface.contextual.size + surface.adapter.size + surface.webOnly.size,
    surface.official.size,
  )
})
