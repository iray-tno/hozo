import assert from 'node:assert/strict'
import { test } from 'node:test'
import { generateStylexManifest } from './stylex-manifest-generate.ts'
import {
  manifestEntry,
  mappedHozoStylexProperties,
  officialStylexProperties,
  stylexManifest,
  stylexSurface,
  stylexVersion,
} from './stylex-surface.ts'

test('the checked-in StyleX manifest matches upstream types and Rust lowering arms', () => {
  assert.deepEqual(stylexManifest(), generateStylexManifest())
})

test('StyleX publishes the property denominator used by the report', () => {
  assert.equal(stylexVersion(), '0.19.0')
  const properties = officialStylexProperties()
  assert.equal(properties.size, 522)
  for (const name of ['alignItems', 'backgroundColor', 'padding', 'transform']) {
    assert.ok(properties.has(name), `${name} should be in StyleX CSSProperties`)
  }
})

test('the manifest numerator reproduces the Rust frontend mapping', () => {
  const mapped = mappedHozoStylexProperties()
  assert.equal(mapped.size, 301)
  for (const name of [
    'display',
    'padding',
    'backgroundColor',
    'textAlign',
    'transform',
    'transformOrigin',
    'containerName',
    'containerType',
    'container',
    'flexFlow',
    'gridGap',
    'gridRowGap',
    'gridColumnGap',
    'borderBlockWidth',
    'borderInlineWidth',
    'borderInlineColor',
    'borderBlockStyle',
    'borderInlineStartStyle',
    'borderTopStyle',
  ]) {
    assert.ok(mapped.has(name), `${name} should have a lowering arm`)
  }
  assert.ok(mapped.has('animationDuration'))
  assert.ok(mapped.has('scrollbarWidth'))
  assert.ok(mapped.has('fontVariantNumeric'))
  assert.ok(mapped.has('textWrap'))
  assert.ok(mapped.has('blockSize'))
  assert.ok(mapped.has('accentColor'))
  assert.ok(mapped.has('fill'))
  assert.ok(mapped.has('strokeDasharray'))
  assert.ok(mapped.has('borderCollapse'))
  assert.ok(mapped.has('contain'))
  assert.ok(mapped.has('columns'))
  assert.ok(mapped.has('columnRule'))
  assert.ok(mapped.has('listStyle'))
  assert.ok(mapped.has('scrollMargin'))
  assert.ok(mapped.has('scrollPadding'))
  assert.ok(mapped.has('scrollMarginBlock'))
  assert.ok(mapped.has('scrollMarginInline'))
  assert.ok(mapped.has('scrollPaddingBlock'))
  assert.ok(mapped.has('scrollPaddingInline'))
})

test('every mapped property records why it is counted', () => {
  const mapped = stylexManifest().properties.filter(({ status }) => status === 'mapped')
  assert.equal(mapped.length, 301)
  assert.ok(
    mapped.every(({ basis }) => !basis.endsWith('candidate') && basis !== 'not-yet-lowered'),
  )
  assert.equal(manifestEntry('padding')?.basis, 'shared-typed-ir')
  assert.equal(manifestEntry('gridTemplateColumns')?.basis, 'contextual-runtime')
  assert.equal(manifestEntry('container')?.basis, 'contextual-runtime')
  assert.equal(manifestEntry('flexFlow')?.basis, 'shared-typed-ir')
  assert.equal(manifestEntry('gridGap')?.basis, 'shared-typed-ir')
  assert.equal(manifestEntry('borderInlineWidth')?.basis, 'shared-typed-ir')
  assert.equal(manifestEntry('borderBlockStyle')?.basis, 'exact-web-native-refusal')
  assert.equal(manifestEntry('scrollbarWidth')?.basis, 'exact-web-native-refusal')
  assert.equal(manifestEntry('fontKerning')?.basis, 'exact-web-native-refusal')
  assert.equal(manifestEntry('paintOrder')?.basis, 'exact-web-native-refusal')
  assert.equal(manifestEntry('listStyleType')?.basis, 'exact-web-native-refusal')
  assert.equal(manifestEntry('listStyle')?.basis, 'exact-web-native-refusal')
  assert.equal(manifestEntry('scrollMargin')?.basis, 'exact-web-native-refusal')
  assert.equal(manifestEntry('backdropFilter')?.basis, 'adapter-candidate')
})

test('the universal denominator is derived from StyleX and React Native', () => {
  const surface = stylexSurface()
  assert.equal(surface.native.size, 129)
  assert.equal(surface.mappedNative.size, 129)
  assert.equal(surface.missingNative.size, 0)
  assert.ok(!surface.missingNative.has('borderWidth'))
  assert.ok(!surface.missingNative.has('pointerEvents'))
  assert.ok(!surface.missingNative.has('fontFamily'))
  assert.ok(!surface.missingNative.has('transform'))
  assert.ok(!surface.missingNative.has('transformOrigin'))
  assert.ok(!surface.missingNative.has('animationDuration'))
  assert.ok(surface.mappedNative.has('flexFlow'))
  assert.ok(surface.mappedNative.has('gridGap'))
  assert.ok(surface.mappedNative.has('borderInlineColor'))
  assert.ok(surface.mappedNative.has('borderBlockWidth'))
})

test('coverage tiers partition the published StyleX property surface', () => {
  const surface = stylexSurface()
  assert.equal(surface.contextual.size, 17)
  assert.equal(surface.mappedContextual.size, 17)
  assert.ok(surface.contextual.has('gridTemplateColumns'))
  assert.ok(surface.mappedContextual.has('gridTemplateColumns'))
  assert.ok(surface.mappedContextual.has('gridRowEnd'))
  assert.ok(surface.mappedContextual.has('transitionDuration'))
  assert.ok(surface.mappedContextual.has('transitionProperty'))
  assert.ok(surface.mappedContextual.has('transitionTimingFunction'))
  assert.ok(surface.contextual.has('transitionProperty'))
  assert.ok(surface.mappedContextual.has('containerName'))
  assert.ok(surface.mappedContextual.has('containerType'))
  assert.ok(surface.mappedContextual.has('container'))
  assert.ok(surface.mappedContextual.has('whiteSpace'))
  assert.ok(surface.mappedContextual.has('textOverflow'))
  assert.ok(surface.mappedContextual.has('caretColor'))
  assert.equal(surface.adapter.size, 1)
  assert.equal(surface.mappedAdapter.size, 0)
  assert.ok(surface.adapter.has('backdropFilter'))
  assert.equal(surface.webOnly.size, 375)
  assert.equal(surface.mappedWebOnly.size, 155)
  assert.ok(surface.mappedWebOnly.has('overscrollBehavior'))
  assert.ok(surface.mappedWebOnly.has('scrollSnapType'))
  assert.ok(surface.mappedWebOnly.has('scrollbarWidth'))
  assert.ok(surface.mappedWebOnly.has('touchAction'))
  assert.ok(surface.mappedWebOnly.has('overflowX'))
  assert.ok(surface.mappedWebOnly.has('scrollMarginInlineEnd'))
  assert.ok(surface.mappedWebOnly.has('textIndent'))
  assert.ok(surface.mappedWebOnly.has('animationDuration'))
  assert.ok(surface.mappedWebOnly.has('backgroundSize'))
  assert.ok(surface.mappedWebOnly.has('wordBreak'))
  assert.ok(surface.mappedWebOnly.has('fontVariantCaps'))
  assert.ok(surface.mappedWebOnly.has('textDecorationSkipInk'))
  assert.ok(surface.mappedWebOnly.has('inlineSize'))
  assert.ok(surface.mappedWebOnly.has('backgroundBlendMode'))
  assert.ok(surface.mappedWebOnly.has('WebkitTapHighlightColor'))
  assert.ok(surface.mappedWebOnly.has('fill'))
  assert.ok(surface.mappedWebOnly.has('strokeWidth'))
  assert.ok(surface.mappedWebOnly.has('columnCount'))
  assert.ok(surface.mappedWebOnly.has('tableLayout'))
  assert.ok(surface.mappedWebOnly.has('borderTopStyle'))
  assert.ok(surface.mappedWebOnly.has('borderInlineStyle'))
  assert.equal(
    surface.native.size + surface.contextual.size + surface.adapter.size + surface.webOnly.size,
    surface.official.size,
  )
})
