import assert from 'node:assert/strict'
import { test } from 'node:test'
import { transformSync } from '@babel/core'
import stylexPlugin from '@stylexjs/babel-plugin'
import { generateStylexManifest } from './stylex-manifest-generate.ts'
import {
  manifestEntry,
  mappedHozoStylexProperties,
  officialStylexProperties,
  stylexManifest,
  stylexSurface,
  stylexVersion,
} from './stylex-surface.ts'

function officialCss(property: string, value: string): string {
  const source = `
    import stylex from '@stylexjs/stylex';
    export const styles = stylex.create({ base: { ${property}: ${JSON.stringify(value)} } });
  `
  const output = transformSync(source, {
    filename: '/app/stylex-surface.tsx',
    babelrc: false,
    configFile: false,
    parserOpts: { sourceType: 'module', plugins: ['typescript', 'jsx'] },
    plugins: [[stylexPlugin, { runtimeInjection: false }]],
  })
  const metadata = output?.metadata as { stylex?: [string, { ltr: string }, number][] }
  return (metadata.stylex ?? []).map(([, css]) => css.ltr).join('\n')
}

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
  assert.equal(mapped.size, 505)
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
    'gridArea',
    'gridTemplate',
    'borderBlockWidth',
    'borderInlineWidth',
    'borderInlineColor',
    'borderBlockStyle',
    'borderInlineStartStyle',
    'borderTopStyle',
    'animationRange',
    'scrollTimeline',
    'viewTimeline',
    'backdropFilter',
  ]) {
    assert.ok(mapped.has(name), `${name} should have a lowering arm`)
  }
  assert.ok(mapped.has('animationDuration'))
  assert.ok(mapped.has('animationComposition'))
  assert.ok(mapped.has('animationDelay'))
  assert.ok(mapped.has('animationDirection'))
  assert.ok(mapped.has('animationFillMode'))
  assert.ok(mapped.has('animationIterationCount'))
  assert.ok(mapped.has('animationPlayState'))
  assert.ok(mapped.has('animationTimingFunction'))
  assert.ok(mapped.has('scrollbarWidth'))
  assert.ok(mapped.has('fontVariantNumeric'))
  assert.ok(mapped.has('fontFeatureSettings'))
  assert.ok(mapped.has('fontVariationSettings'))
  assert.ok(mapped.has('textDecorationThickness'))
  assert.ok(mapped.has('WebkitLineClamp'))
  assert.ok(mapped.has('textEmphasisStyle'))
  assert.ok(mapped.has('wordSpacing'))
  assert.ok(mapped.has('textWrap'))
  assert.ok(mapped.has('blockSize'))
  assert.ok(mapped.has('accentColor'))
  assert.ok(mapped.has('fill'))
  assert.ok(mapped.has('strokeDasharray'))
  assert.ok(mapped.has('borderCollapse'))
  assert.ok(mapped.has('contain'))
  assert.ok(mapped.has('containIntrinsicSize'))
  assert.ok(mapped.has('breakInside'))
  assert.ok(mapped.has('pageBreakAfter'))
  assert.ok(mapped.has('rubyPosition'))
  assert.ok(mapped.has('unicodeBidi'))
  assert.ok(mapped.has('boxDecorationBreak'))
  assert.ok(mapped.has('WebkitBoxOrient'))
  assert.ok(mapped.has('overflowBlock'))
  assert.ok(mapped.has('overflowClipMargin'))
  assert.ok(mapped.has('hyphenateLimitChars'))
  assert.ok(mapped.has('mathDepth'))
  assert.ok(mapped.has('imageResolution'))
  assert.ok(mapped.has('initialLetter'))
  assert.ok(mapped.has('scrollTimelineName'))
  assert.ok(mapped.has('anchorName'))
  assert.ok(mapped.has('positionAnchor'))
  assert.ok(mapped.has('animationTimeline'))
  assert.ok(mapped.has('animationRangeStart'))
  assert.ok(mapped.has('alignTracks'))
  assert.ok(mapped.has('masonryAutoFlow'))
  assert.ok(mapped.has('viewTransitionName'))
  assert.ok(mapped.has('columns'))
  assert.ok(mapped.has('columnRule'))
  assert.ok(mapped.has('listStyle'))
  assert.ok(mapped.has('scrollMargin'))
  assert.ok(mapped.has('scrollPadding'))
  assert.ok(mapped.has('scrollMarginBlock'))
  assert.ok(mapped.has('scrollMarginInline'))
  assert.ok(mapped.has('scrollPaddingBlock'))
  assert.ok(mapped.has('scrollPaddingInline'))
  assert.ok(mapped.has('translate'))
  assert.ok(mapped.has('rotate'))
  assert.ok(mapped.has('scale'))
  assert.ok(mapped.has('clipPath'))
  assert.ok(mapped.has('perspective'))
  assert.ok(mapped.has('perspectiveOrigin'))
  assert.ok(mapped.has('transformBox'))
  assert.ok(mapped.has('transformStyle'))
  assert.ok(mapped.has('willChange'))
  for (const property of [
    'WebkitMaskImage',
    'maskImage',
    'maskMode',
    'maskBorderSource',
    'maskBorderSlice',
    'maskBorder',
    'borderImage',
    'cornerShape',
    'cornerStartStartShape',
    'cornerStartEndShape',
    'cornerEndStartShape',
    'cornerEndEndShape',
    'cornerTopLeftShape',
    'cornerTopRightShape',
    'cornerBottomLeftShape',
    'cornerBottomRightShape',
    'font',
    'positionArea',
    'positionTry',
    'positionTryFallbacks',
    'positionTryOptions',
    'glyphOrientationVertical',
    'textDecorationSkip',
    'counterIncrement',
    'counterReset',
    'counterSet',
    'scrollbarColor',
    'quotes',
    'content',
    'caret',
    'grid',
    'offset',
    'zoom',
    'textDecoration',
    'textEmphasis',
    'outline',
    'transition',
    'maskRepeat',
    'maskPosition',
    'maskSize',
    'maskOrigin',
    'maskClip',
    'maskComposite',
    'maskType',
    'float',
    'clear',
    'offsetAnchor',
    'offsetDistance',
    'offsetPath',
    'offsetPosition',
    'offsetRotate',
    'shapeImageThreshold',
    'shapeMargin',
    'shapeOutside',
    'borderImageSource',
    'borderImageSlice',
    'borderImageWidth',
    'borderImageOutset',
    'borderImageRepeat',
    'gridAutoColumns',
    'gridAutoRows',
    'gridAutoFlow',
    'gridTemplateAreas',
    'cue',
    'cueAfter',
    'cueBefore',
    'pause',
    'pauseAfter',
    'pauseBefore',
    'rest',
    'restAfter',
    'restBefore',
    'azimuth',
    'speak',
    'speakAs',
    'voiceBalance',
    'voiceDuration',
    'voiceFamily',
    'voicePitch',
    'voiceRange',
    'voiceRate',
    'voiceStress',
    'voiceVolume',
    'page',
  ]) {
    assert.ok(mapped.has(property), `${property} should have a lowering arm`)
  }
})

test('every mapped property records why it is counted', () => {
  const mapped = stylexManifest().properties.filter(({ status }) => status === 'mapped')
  assert.equal(mapped.length, 505)
  assert.ok(
    mapped.every(({ basis }) => !basis.endsWith('candidate') && basis !== 'not-yet-lowered'),
  )
  assert.equal(manifestEntry('padding')?.basis, 'shared-typed-ir')
  assert.equal(manifestEntry('gridTemplateColumns')?.basis, 'contextual-runtime')
  assert.equal(manifestEntry('gridArea')?.basis, 'contextual-runtime')
  assert.equal(manifestEntry('gridTemplate')?.basis, 'contextual-runtime')
  assert.equal(manifestEntry('container')?.basis, 'contextual-runtime')
  assert.equal(manifestEntry('flexFlow')?.basis, 'shared-typed-ir')
  assert.equal(manifestEntry('gridGap')?.basis, 'shared-typed-ir')
  assert.equal(manifestEntry('translate')?.basis, 'shared-typed-ir')
  assert.equal(manifestEntry('rotate')?.basis, 'shared-typed-ir')
  assert.equal(manifestEntry('scale')?.basis, 'shared-typed-ir')
  assert.equal(manifestEntry('borderInlineWidth')?.basis, 'shared-typed-ir')
  assert.equal(manifestEntry('borderBlockStyle')?.basis, 'exact-web-native-refusal')
  assert.equal(manifestEntry('scrollbarWidth')?.basis, 'exact-web-native-refusal')
  assert.equal(manifestEntry('fontKerning')?.basis, 'exact-web-native-refusal')
  assert.equal(manifestEntry('fontVariationSettings')?.basis, 'exact-web-native-refusal')
  assert.equal(manifestEntry('paintOrder')?.basis, 'exact-web-native-refusal')
  assert.equal(manifestEntry('listStyleType')?.basis, 'exact-web-native-refusal')
  assert.equal(manifestEntry('listStyle')?.basis, 'exact-web-native-refusal')
  assert.equal(manifestEntry('scrollMargin')?.basis, 'exact-web-native-refusal')
  assert.equal(manifestEntry('animationRange')?.basis, 'exact-web-native-refusal')
  assert.equal(manifestEntry('scrollTimeline')?.basis, 'exact-web-native-refusal')
  assert.equal(manifestEntry('viewTimeline')?.basis, 'exact-web-native-refusal')
  assert.equal(manifestEntry('backdropFilter')?.basis, 'optional-adapter')
  assert.equal(manifestEntry('backdropFilter')?.disposition, 'implemented')
})

test('every unmapped property has an explicit reviewed disposition', () => {
  const entries = stylexManifest().properties.filter(({ status }) => status === 'unmapped')
  assert.equal(entries.length, 17)
  assert.deepEqual(
    entries
      .filter(({ disposition }) => disposition === 'default-mode-disallowed')
      .map(({ name }) => name),
    [
      'animation',
      'background',
      'border',
      'borderBlock',
      'borderBlockEnd',
      'borderBlockStart',
      'borderBottom',
      'borderInline',
      'borderInlineEnd',
      'borderInlineStart',
      'borderLeft',
      'borderRight',
      'borderTop',
    ],
  )
  assert.deepEqual(
    entries.filter(({ disposition }) => disposition === 'descriptor-only').map(({ name }) => name),
    ['src', 'unicodeRange'],
  )
  assert.deepEqual(
    entries
      .filter(({ disposition }) => disposition === 'obsolete-or-nonstandard')
      .map(({ name }) => name),
    ['behavior', 'theme'],
  )
  assert.deepEqual(
    entries.filter(({ disposition }) => disposition === 'optional-adapter').map(({ name }) => name),
    [],
  )
})

test('default-mode-disallowed shorthands emit no CSS in StyleX default mode', () => {
  const entries = stylexManifest().properties.filter(
    ({ disposition }) => disposition === 'default-mode-disallowed',
  )
  for (const { name } of entries) {
    const value = name === 'animation' ? 'fade 1s' : name === 'background' ? 'red' : '1px solid red'
    assert.equal(
      officialCss(name, value),
      '',
      `${name} unexpectedly became an upstream declaration`,
    )
  }
})

test('actionable coverage separates compiler work from optional adapters', () => {
  const surface = stylexSurface()
  assert.equal(surface.compilerRelevant.size, 504)
  assert.equal(surface.mappedCompilerRelevant.size, 504)
  assert.equal(surface.productRelevant.size, 505)
  assert.equal(surface.mappedProductRelevant.size, 505)
  assert.equal(surface.nonActionable.size, 17)
  assert.deepEqual(
    [...surface.productRelevant].filter((name) => !surface.mapped.has(name)),
    [],
  )
})

test('the universal denominator is derived from StyleX and React Native', () => {
  const surface = stylexSurface()
  assert.equal(surface.native.size, 134)
  assert.equal(surface.mappedNative.size, 134)
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
  assert.ok(surface.mappedNative.has('translate'))
  assert.ok(surface.mappedNative.has('rotate'))
  assert.ok(surface.mappedNative.has('scale'))
  assert.ok(surface.mappedNative.has('textShadow'))
  assert.ok(surface.mappedNative.has('placeContent'))
})

test('coverage tiers partition the published StyleX property surface', () => {
  const surface = stylexSurface()
  assert.equal(surface.contextual.size, 21)
  assert.equal(surface.mappedContextual.size, 21)
  assert.ok(surface.contextual.has('gridTemplateColumns'))
  assert.ok(surface.contextual.has('gridArea'))
  assert.ok(surface.contextual.has('gridTemplate'))
  assert.ok(surface.mappedContextual.has('gridTemplateColumns'))
  assert.ok(surface.mappedContextual.has('gridRowEnd'))
  assert.ok(surface.mappedContextual.has('transitionDuration'))
  assert.ok(surface.mappedContextual.has('transitionDelay'))
  assert.ok(surface.mappedContextual.has('transition'))
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
  assert.equal(surface.mappedAdapter.size, 1)
  assert.ok(surface.adapter.has('backdropFilter'))
  assert.equal(surface.webOnly.size, 366)
  assert.equal(surface.mappedWebOnly.size, 349)
  assert.ok(surface.mappedWebOnly.has('overscrollBehavior'))
  assert.ok(surface.mappedWebOnly.has('content'))
  assert.ok(surface.mappedWebOnly.has('caret'))
  assert.ok(surface.mappedWebOnly.has('grid'))
  assert.ok(surface.mappedWebOnly.has('offset'))
  assert.ok(surface.mappedWebOnly.has('scrollSnapType'))
  assert.ok(surface.mappedWebOnly.has('scrollbarWidth'))
  assert.ok(surface.mappedWebOnly.has('containIntrinsicSize'))
  assert.ok(surface.mappedWebOnly.has('breakInside'))
  assert.ok(surface.mappedWebOnly.has('pageBreakAfter'))
  assert.ok(surface.mappedWebOnly.has('rubyPosition'))
  assert.ok(surface.mappedWebOnly.has('unicodeBidi'))
  assert.ok(surface.mappedWebOnly.has('boxDecorationBreak'))
  assert.ok(surface.mappedWebOnly.has('WebkitBoxOrient'))
  assert.ok(surface.mappedWebOnly.has('overflowClipMargin'))
  assert.ok(surface.mappedWebOnly.has('overflowBlock'))
  assert.ok(surface.mappedWebOnly.has('overflowBlockX'))
  assert.ok(surface.mappedWebOnly.has('hyphenateLimitChars'))
  assert.ok(surface.mappedWebOnly.has('mathDepth'))
  assert.ok(surface.mappedWebOnly.has('imageResolution'))
  assert.ok(surface.mappedWebOnly.has('initialLetter'))
  assert.ok(surface.mappedWebOnly.has('scrollTimelineName'))
  assert.ok(surface.mappedWebOnly.has('anchorName'))
  assert.ok(surface.mappedWebOnly.has('positionAnchor'))
  assert.ok(surface.mappedWebOnly.has('positionArea'))
  assert.ok(surface.mappedWebOnly.has('positionTry'))
  assert.ok(surface.mappedWebOnly.has('positionTryFallbacks'))
  assert.ok(surface.mappedWebOnly.has('positionTryOptions'))
  assert.ok(surface.mappedWebOnly.has('animationTimeline'))
  assert.ok(surface.mappedWebOnly.has('animationRangeStart'))
  assert.ok(surface.mappedWebOnly.has('alignTracks'))
  assert.ok(surface.mappedWebOnly.has('masonryAutoFlow'))
  assert.ok(surface.mappedWebOnly.has('mask'))
  assert.ok(surface.mappedWebOnly.has('maskBorderSource'))
  assert.ok(surface.mappedWebOnly.has('maskBorder'))
  assert.ok(surface.mappedWebOnly.has('borderImage'))
  assert.ok(surface.mappedWebOnly.has('cornerShape'))
  assert.ok(surface.mappedWebOnly.has('cornerStartStartShape'))
  assert.ok(surface.mappedWebOnly.has('cornerTopLeftShape'))
  assert.ok(surface.mappedWebOnly.has('font'))
  assert.ok(surface.mappedWebOnly.has('glyphOrientationVertical'))
  assert.ok(surface.mappedWebOnly.has('textDecorationSkip'))
  assert.ok(surface.mappedWebOnly.has('viewTransitionName'))
  assert.ok(surface.mappedWebOnly.has('touchAction'))
  assert.ok(surface.mappedWebOnly.has('overflowX'))
  assert.ok(surface.mappedWebOnly.has('scrollMarginInlineEnd'))
  assert.ok(surface.mappedWebOnly.has('textIndent'))
  assert.ok(surface.mappedWebOnly.has('animationDuration'))
  assert.ok(surface.mappedWebOnly.has('animationDelay'))
  assert.ok(surface.mappedWebOnly.has('animationIterationCount'))
  assert.ok(surface.mappedWebOnly.has('animationTimingFunction'))
  assert.ok(surface.mappedWebOnly.has('animationName'))
  assert.ok(surface.mappedWebOnly.has('backgroundSize'))
  assert.ok(surface.mappedWebOnly.has('wordBreak'))
  assert.ok(surface.mappedWebOnly.has('fontVariantCaps'))
  assert.ok(surface.mappedWebOnly.has('textDecorationSkipInk'))
  assert.ok(surface.mappedWebOnly.has('fontFeatureSettings'))
  assert.ok(surface.mappedWebOnly.has('fontVariationSettings'))
  assert.ok(surface.mappedWebOnly.has('textDecorationThickness'))
  assert.ok(surface.mappedWebOnly.has('WebkitLineClamp'))
  assert.ok(surface.mappedWebOnly.has('textEmphasisStyle'))
  assert.ok(surface.mappedWebOnly.has('wordSpacing'))
  assert.ok(surface.mappedWebOnly.has('inlineSize'))
  assert.ok(surface.mappedWebOnly.has('backgroundBlendMode'))
  assert.ok(surface.mappedWebOnly.has('WebkitTapHighlightColor'))
  assert.ok(surface.mappedWebOnly.has('fill'))
  assert.ok(surface.mappedWebOnly.has('strokeWidth'))
  assert.ok(surface.mappedWebOnly.has('columnCount'))
  assert.ok(surface.mappedWebOnly.has('tableLayout'))
  assert.ok(surface.mappedWebOnly.has('borderTopStyle'))
  assert.ok(surface.mappedWebOnly.has('borderInlineStyle'))
  assert.ok(surface.mappedWebOnly.has('clipPath'))
  assert.ok(surface.mappedWebOnly.has('perspective'))
  assert.ok(surface.mappedWebOnly.has('perspectiveOrigin'))
  assert.ok(surface.mappedWebOnly.has('transformBox'))
  assert.ok(surface.mappedWebOnly.has('transformStyle'))
  assert.ok(surface.mappedWebOnly.has('willChange'))
  assert.ok(surface.mappedWebOnly.has('WebkitMaskImage'))
  assert.ok(surface.mappedWebOnly.has('maskImage'))
  assert.ok(surface.mappedWebOnly.has('maskComposite'))
  assert.ok(surface.mappedWebOnly.has('maskType'))
  assert.ok(surface.mappedWebOnly.has('float'))
  assert.ok(surface.mappedWebOnly.has('offsetPath'))
  assert.ok(surface.mappedWebOnly.has('shapeOutside'))
  assert.ok(surface.mappedWebOnly.has('borderImageSource'))
  assert.ok(surface.mappedWebOnly.has('borderImageSlice'))
  assert.ok(surface.mappedWebOnly.has('borderImageRepeat'))
  assert.ok(surface.mappedWebOnly.has('gridAutoColumns'))
  assert.ok(surface.mappedWebOnly.has('gridAutoRows'))
  assert.ok(surface.mappedWebOnly.has('gridAutoFlow'))
  assert.ok(surface.mappedWebOnly.has('gridTemplateAreas'))
  assert.equal(
    surface.native.size + surface.contextual.size + surface.adapter.size + surface.webOnly.size,
    surface.official.size,
  )
})
