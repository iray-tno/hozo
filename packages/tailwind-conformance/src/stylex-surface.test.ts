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
  assert.equal(mapped.size, 109)
  for (const name of ['display', 'padding', 'backgroundColor', 'textAlign']) {
    assert.ok(mapped.has(name), `${name} should have a lowering arm`)
  }
  assert.ok(!mapped.has('transform'))
})

test('the universal denominator is derived from StyleX and React Native', () => {
  const surface = stylexSurface()
  assert.equal(surface.native.size, 114)
  assert.equal(surface.mappedNative.size, 109)
  assert.equal(surface.missingNative.size, 5)
  assert.ok(!surface.missingNative.has('borderWidth'))
  assert.ok(!surface.missingNative.has('pointerEvents'))
  assert.ok(surface.missingNative.has('fontFamily'))
  assert.ok(!surface.missingNative.has('animationDuration'))
})
