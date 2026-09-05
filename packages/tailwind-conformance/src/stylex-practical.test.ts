import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  compareStylexConstruct,
  compareStylexValue,
  STYLEX_VALUE_CASES,
  stylexPracticalScorecard,
} from './stylex-practical.ts'

test('the practical StyleX scorecard is measured from executable fixtures', () => {
  const score = stylexPracticalScorecard()
  assert.deepEqual(score, {
    values: { total: 287, covered: 287 },
    constructs: { total: 16, covered: 16 },
    corpus: { total: 248, covered: 248 },
    silent: 0,
  })
})

test('placeContent expands to portable content-alignment slots', () => {
  for (const value of ['center', 'space-between center', 'flex-start flex-end']) {
    assert.deepEqual(compareStylexValue({ property: 'placeContent', value }), {
      property: 'placeContent',
      value,
      covered: true,
      silent: false,
    })
  }
})

test('single-layer text shadow agrees with StyleX and lowers on Native', () => {
  for (const value of ['rgba(0, 0, 0, 0.5) 1px 2px 4px', '#123456 -1px 2px', 'none']) {
    assert.deepEqual(compareStylexValue({ property: 'textShadow', value }), {
      property: 'textShadow',
      value,
      covered: true,
      silent: false,
    })
  }
})

test('standalone transforms agree with official StyleX and lower on Native', () => {
  for (const testCase of [
    { property: 'translate', value: '12px 25%' },
    { property: 'rotate', value: '10deg' },
    { property: 'scale', value: '0.9 110%' },
  ]) {
    assert.equal(compareStylexValue(testCase).covered, true, testCase.property)
  }
})

test('animation control longhands agree with official StyleX for their common grammar', () => {
  const values: Record<string, readonly (string | number)[]> = {
    animationComposition: ['replace', 'add', 'accumulate'],
    animationDelay: ['0ms', '100ms', '-100ms', '0.5ms', '1s'],
    animationDirection: ['normal', 'reverse', 'alternate', 'alternate-reverse'],
    animationFillMode: ['none', 'forwards', 'backwards', 'both'],
    animationIterationCount: [0, 1, 2.5, 'infinite'],
    animationPlayState: ['running', 'paused'],
    animationTimingFunction: [
      'linear',
      'ease',
      'ease-in',
      'ease-out',
      'ease-in-out',
      'step-start',
      'step-end',
      'cubic-bezier(0.4, 0, 0.2, 1)',
      'steps(2, jump-none)',
    ],
  }

  for (const [property, propertyValues] of Object.entries(values)) {
    for (const value of propertyValues) {
      assert.deepEqual(compareStylexValue({ property, value }), {
        property,
        value,
        covered: true,
        silent: false,
      })
    }
  }
})

test('compositing and 3D rendering hints agree with official StyleX', () => {
  for (const testCase of [
    { property: 'clipPath', value: 'polygon(0 0, 100% 0, 50% 100%)' },
    { property: 'perspective', value: '800px' },
    { property: 'perspectiveOrigin', value: '25% 75%' },
    { property: 'transformBox', value: 'fill-box' },
    { property: 'transformStyle', value: 'preserve-3d' },
    { property: 'willChange', value: 'opacity, transform' },
  ]) {
    assert.deepEqual(compareStylexValue(testCase), {
      ...testCase,
      covered: true,
      silent: false,
    })
  }
})

test('common mask longhands agree with official StyleX', () => {
  for (const testCase of [
    { property: 'WebkitMaskImage', value: 'url(mask.svg)' },
    { property: 'maskImage', value: 'linear-gradient(black, transparent)' },
    { property: 'maskMode', value: 'luminance' },
    { property: 'maskRepeat', value: 'no-repeat' },
    { property: 'maskPosition', value: 'center top' },
    { property: 'maskSize', value: 'cover' },
    { property: 'maskOrigin', value: 'border-box' },
    { property: 'maskClip', value: 'no-clip' },
    { property: 'maskComposite', value: 'exclude' },
    { property: 'maskType', value: 'alpha' },
    { property: 'maskImage', value: 'url(a.svg), linear-gradient(black, transparent)' },
    { property: 'maskRepeat', value: 'repeat-x, space no-repeat' },
    { property: 'maskPosition', value: 'left top, 25% 75%' },
    { property: 'maskSize', value: 'cover, 50% auto' },
    { property: 'maskOrigin', value: 'border-box, content-box' },
    { property: 'maskClip', value: 'border-box, no-clip' },
    { property: 'maskComposite', value: 'add, exclude' },
    { property: 'maskBorderMode', value: 'luminance' },
    { property: 'maskBorderOutset', value: '4px 8px' },
    { property: 'maskBorderRepeat', value: 'round stretch' },
    { property: 'maskBorderSlice', value: '30% fill' },
    { property: 'maskBorderSource', value: 'linear-gradient(black, transparent)' },
    { property: 'maskBorderWidth', value: '1 2 3 4' },
  ]) {
    assert.deepEqual(compareStylexValue(testCase), {
      ...testCase,
      covered: true,
      silent: false,
    })
  }
})

test('motion paths and float shapes agree with official StyleX', () => {
  for (const testCase of [
    { property: 'float', value: 'left' },
    { property: 'clear', value: 'both' },
    { property: 'offsetAnchor', value: 'left top' },
    { property: 'offsetDistance', value: '25%' },
    { property: 'offsetDistance', value: '-10px' },
    { property: 'offsetPath', value: 'path("M 0 0 L 100 100")' },
    { property: 'offsetPath', value: 'ray(45deg closest-side)' },
    { property: 'offsetPosition', value: 'center top' },
    { property: 'offsetRotate', value: 'auto 45deg' },
    { property: 'offsetRotate', value: 'reverse -15deg' },
    { property: 'shapeImageThreshold', value: 0.5 },
    { property: 'shapeMargin', value: '1rem' },
    { property: 'shapeOutside', value: 'circle(50%)' },
    { property: 'shapeOutside', value: 'polygon(0 0, 100% 0, 50% 100%)' },
  ]) {
    assert.deepEqual(compareStylexValue(testCase), {
      ...testCase,
      covered: true,
      silent: false,
    })
  }
})

test('border image longhands agree with official StyleX', () => {
  for (const testCase of [
    { property: 'borderImageSource', value: 'linear-gradient(red, blue)' },
    { property: 'borderImageSource', value: 'url(border.svg)' },
    { property: 'borderImageSlice', value: '30% fill' },
    { property: 'borderImageSlice', value: 30 },
    { property: 'borderImageWidth', value: '1 2 3 4' },
    { property: 'borderImageWidth', value: 2 },
    { property: 'borderImageOutset', value: '4px 8px' },
    { property: 'borderImageOutset', value: 2 },
    { property: 'borderImageRepeat', value: 'round stretch' },
  ]) {
    assert.deepEqual(compareStylexValue(testCase), {
      ...testCase,
      covered: true,
      silent: false,
    })
  }
})

test('implicit grid tracks, flow, and template areas agree with official StyleX', () => {
  for (const testCase of [
    { property: 'gridAutoColumns', value: 'minmax(100px, 1fr)' },
    { property: 'gridAutoRows', value: '48px auto' },
    { property: 'gridAutoFlow', value: 'column dense' },
    { property: 'gridTemplateAreas', value: '"header header" "main aside"' },
  ]) {
    assert.deepEqual(compareStylexValue(testCase), {
      ...testCase,
      covered: true,
      silent: false,
    })
  }
})

test('gridArea agrees with StyleX and lowers through the Native grid item runtime', () => {
  for (const value of ['1 / 1 / 3 / 3', '1 / 2 / 3 / 3']) {
    assert.equal(compareStylexValue({ property: 'gridArea', value }).covered, true)
  }
})

test('track-only gridTemplate agrees with StyleX and lowers through the Native grid runtime', () => {
  for (const value of ['48px 1fr / 1fr 2fr', 'minmax(80px, 1fr) / 120px 2fr']) {
    assert.equal(compareStylexValue({ property: 'gridTemplate', value }).covered, true)
  }
})

test('the cross-file construct is measured through a resolved module binding', () => {
  assert.deepEqual(
    compareStylexConstruct({ name: 'cross-file sheet', expression: 'external.root' }),
    { name: 'cross-file sheet', covered: true, silent: false },
  )
})

test('new common text values are covered without silent fallback', () => {
  const whiteSpace = STYLEX_VALUE_CASES.find(({ property }) => property === 'whiteSpace')
  assert.ok(whiteSpace)
  assert.deepEqual(compareStylexValue(whiteSpace), {
    property: 'whiteSpace',
    value: 'nowrap',
    covered: true,
    silent: false,
  })

  const fontWeight = STYLEX_VALUE_CASES.find(({ property }) => property === 'fontWeight')
  assert.ok(fontWeight)
  assert.deepEqual(compareStylexValue(fontWeight), {
    property: 'fontWeight',
    value: 700,
    covered: true,
    silent: false,
  })
})

test('every accepted browser typography keyword agrees with official StyleX', () => {
  const keywords: Record<string, readonly string[]> = {
    fontKerning: ['auto', 'normal', 'none'],
    fontOpticalSizing: ['auto', 'none'],
    fontStretch: [
      'normal',
      'ultra-condensed',
      'extra-condensed',
      'condensed',
      'semi-condensed',
      'semi-expanded',
      'expanded',
      'extra-expanded',
      'ultra-expanded',
    ],
    fontSynthesisPosition: ['auto', 'none'],
    fontSynthesisSmallCaps: ['auto', 'none'],
    fontSynthesisStyle: ['auto', 'none'],
    fontSynthesisWeight: ['auto', 'none'],
    fontVariantCaps: [
      'normal',
      'small-caps',
      'all-small-caps',
      'petite-caps',
      'all-petite-caps',
      'unicase',
      'titling-caps',
    ],
    fontVariantLigatures: ['normal', 'none'],
    fontVariantNumeric: [
      'normal',
      'lining-nums',
      'oldstyle-nums',
      'proportional-nums',
      'tabular-nums',
      'diagonal-fractions',
      'stacked-fractions',
      'ordinal',
      'slashed-zero',
    ],
    fontVariantPosition: ['normal', 'sub', 'super'],
    hyphens: ['none', 'manual', 'auto'],
    lineBreak: ['auto', 'loose', 'normal', 'strict'],
    textAlignLast: ['auto', 'start', 'end', 'left', 'right', 'center', 'justify', 'inherit'],
    textDecorationSkipInk: ['auto', 'none', 'all'],
    textJustify: ['none', 'auto', 'inter-word', 'inter-character', 'distribute'],
    textOrientation: ['mixed', 'upright', 'sideways'],
    textWrap: ['wrap', 'nowrap', 'balance', 'pretty', 'stable'],
  }

  for (const [property, values] of Object.entries(keywords)) {
    for (const value of values) {
      assert.deepEqual(compareStylexValue({ property, value }), {
        property,
        value,
        covered: true,
        silent: false,
      })
    }
  }
})

test('advanced font controls agree with official StyleX for practical values', () => {
  const values: Record<string, readonly (string | number)[]> = {
    fontFeatureSettings: ['normal', '"kern"', '"kern" 1, "liga" off'],
    fontLanguageOverride: ['normal', '"TRK"'],
    fontPalette: ['normal', 'light', 'dark', 'brandPalette'],
    fontSizeAdjust: ['none', 0.5],
    fontSynthesis: ['none', 'weight', 'weight style small-caps position'],
    fontVariantAlternates: [
      'normal',
      'historical-forms',
      'stylistic(display)',
      'styleset(display, compact)',
    ],
    fontVariantEastAsian: ['normal', 'jis78', 'traditional proportional-width ruby'],
    fontVariationSettings: ['normal', '"wght" 650', '"wght" 650, "wdth" 90'],
    textDecorationThickness: ['auto', 'from-font', 2, '25%'],
  }

  for (const [property, propertyValues] of Object.entries(values)) {
    for (const value of propertyValues) {
      assert.deepEqual(compareStylexValue({ property, value }), {
        property,
        value,
        covered: true,
        silent: false,
      })
    }
  }
})

test('browser text controls agree with official StyleX for practical values', () => {
  const values: Record<string, readonly (string | number)[]> = {
    WebkitLineClamp: ['none', 3],
    WebkitTextStrokeWidth: [0, 2, 'thin'],
    hangingPunctuation: ['none', 'first', 'first allow-end last'],
    hyphenateCharacter: ['auto', '"-"'],
    tabSize: [0, 4, '2rem'],
    textCombineUpright: ['none', 'all', 'digits 2', 'digits 4'],
    textEmphasisColor: ['currentColor', '#123456'],
    textEmphasisPosition: ['over', 'over right', 'under left'],
    textEmphasisStyle: ['none', 'filled', 'open circle', '"※"'],
    textFillColor: ['currentColor', '#abcdef'],
    textSizeAdjust: ['none', 'auto', '100%'],
    textUnderlineOffset: ['auto', -2, '0.2em'],
    textUnderlinePosition: ['auto', 'from-font', 'under', 'under left'],
    wordSpacing: ['normal', -2, '0.25em', '10%'],
    wordWrap: ['normal', 'break-word'],
  }

  for (const [property, propertyValues] of Object.entries(values)) {
    for (const value of propertyValues) {
      assert.deepEqual(compareStylexValue({ property, value }), {
        property,
        value,
        covered: true,
        silent: false,
      })
    }
  }
})

test('logical, background, form, and vendor values agree with official StyleX', () => {
  const keywords: Record<string, readonly string[]> = {
    backgroundAttachment: ['scroll', 'fixed', 'local'],
    backgroundBlendMode: [
      'normal',
      'multiply',
      'screen',
      'overlay',
      'darken',
      'lighten',
      'color-dodge',
      'color-burn',
      'hard-light',
      'soft-light',
      'difference',
      'exclusion',
      'hue',
      'saturation',
      'color',
      'luminosity',
    ],
    backgroundClip: ['border-box', 'padding-box', 'content-box', 'text'],
    WebkitBackgroundClip: ['border-box', 'padding-box', 'content-box', 'text'],
    backgroundOrigin: ['border-box', 'padding-box', 'content-box'],
    backgroundPositionX: ['left', 'center', 'right'],
    backgroundPositionY: ['top', 'center', 'bottom'],
    caretShape: ['auto', 'bar', 'block', 'underscore'],
    justifyItems: [
      'normal',
      'stretch',
      'center',
      'start',
      'end',
      'flex-start',
      'flex-end',
      'self-start',
      'self-end',
      'left',
      'right',
      'baseline',
      'first baseline',
      'last baseline',
      'safe center',
      'unsafe center',
      'legacy right',
      'legacy left',
      'legacy center',
      'initial',
      'inherit',
      'unset',
    ],
    MozOsxFontSmoothing: ['grayscale'],
    placeSelf: [
      'auto',
      'normal',
      'stretch',
      'center',
      'start',
      'end',
      'self-start',
      'self-end',
      'flex-start',
      'flex-end',
      'baseline',
      'auto auto',
      'normal normal',
      'stretch stretch',
      'center center',
      'start start',
      'end end',
    ],
    WebkitFontSmoothing: ['antialiased'],
    writingMode: [
      'horizontal-tb',
      'vertical-rl',
      'vertical-lr',
      'sideways-rl',
      'sideways-lr',
      'lr-tb',
      'rl-tb',
      'tb-rl',
      'lr',
      'rl',
      'tb',
    ],
  }
  for (const [property, values] of Object.entries(keywords)) {
    for (const value of values) assert.equal(compareStylexValue({ property, value }).covered, true)
  }

  for (const property of [
    'accentColor',
    'WebkitTapHighlightColor',
    'WebkitTextFillColor',
    'WebkitTextStrokeColor',
  ]) {
    for (const value of ['transparent', '#123456', 'rgb(1 2 3)']) {
      assert.equal(compareStylexValue({ property, value }).covered, true)
    }
  }

  const dimensions: Record<string, readonly (string | number)[]> = {
    blockSize: [0, 320, '50%', '12rem', 'auto', 'fit-content'],
    inlineSize: [0, 320, '50%', '12rem', 'auto', 'max-content'],
    minBlockSize: [0, '50%', '12rem', 'auto', 'min-content'],
    minInlineSize: [0, '50%', '12rem', 'auto', 'fill-available'],
    maxBlockSize: [0, '50%', '12rem', 'none', 'max-content'],
    maxInlineSize: [0, '50%', '12rem', 'none', 'fit-content'],
  }
  for (const [property, values] of Object.entries(dimensions)) {
    for (const value of values) assert.equal(compareStylexValue({ property, value }).covered, true)
  }
})

test('SVG paint values agree with official StyleX', () => {
  const cases = [
    { property: 'alignmentBaseline', value: 'middle' },
    { property: 'baselineShift', value: '2px' },
    { property: 'clipRule', value: 'evenodd' },
    { property: 'dominantBaseline', value: 'central' },
    { property: 'fill', value: '#123456' },
    { property: 'fillOpacity', value: 0.5 },
    { property: 'fillOpacity', value: '50%' },
    { property: 'fillRule', value: 'nonzero' },
    { property: 'marker', value: 'url(#dot)' },
    { property: 'markerEnd', value: 'none' },
    { property: 'markerMid', value: 'url(#dot)' },
    { property: 'markerStart', value: 'url(#dot)' },
    { property: 'paintOrder', value: 'stroke fill markers' },
    { property: 'shapeRendering', value: 'crispEdges' },
    { property: 'stroke', value: 'currentColor' },
    { property: 'strokeDasharray', value: '5 3' },
    { property: 'strokeDasharray', value: '5px, 3px' },
    { property: 'strokeDashoffset', value: 2 },
    { property: 'strokeLinecap', value: 'round' },
    { property: 'strokeLinejoin', value: 'bevel' },
    { property: 'strokeMiterlimit', value: 4 },
    { property: 'strokeOpacity', value: 0.5 },
    { property: 'strokeWidth', value: '2px' },
    { property: 'textAnchor', value: 'middle' },
  ] as const
  for (const testCase of cases) assert.equal(compareStylexValue(testCase).covered, true)
})

test('legacy SVG geometry and decoration skipping agree with official StyleX', () => {
  const values: Record<string, readonly (string | number)[]> = {
    glyphOrientationHorizontal: [0, 45, '0.25turn'],
    glyphOrientationVertical: ['auto', 0, '90deg'],
    kerning: ['auto', 0, '0.1em'],
    markerOffset: ['auto', 0, '4px'],
    textDecorationSkip: ['none', 'objects', 'objects ink', 'spaces edges box-decoration'],
  }
  for (const [property, propertyValues] of Object.entries(values)) {
    for (const value of propertyValues) {
      assert.deepEqual(compareStylexValue({ property, value }), {
        property,
        value,
        covered: true,
        silent: false,
      })
    }
  }
})

test('generated-content counters agree with official StyleX', () => {
  const values: Record<string, readonly string[]> = {
    counterIncrement: ['none', 'chapter', 'chapter 1 section -2'],
    counterReset: ['none', 'chapter 0', 'chapter 0 section 1', 'reversed(chapter) 10'],
    counterSet: ['none', 'chapter', 'chapter 3 section -1'],
  }
  for (const [property, propertyValues] of Object.entries(values)) {
    for (const value of propertyValues) {
      assert.deepEqual(compareStylexValue({ property, value }), {
        property,
        value,
        covered: true,
        silent: false,
      })
    }
  }
})

test('browser presentation controls agree with official StyleX', () => {
  const values: Record<string, readonly (string | number)[]> = {
    scrollbarColor: ['auto', 'red blue', 'rgb(20 30 40) transparent'],
    quotes: ['auto', 'none', '"“" "”"', '"“" "”" "‘" "’"'],
    zoom: ['normal', 'reset', '125%', 0, 1.25],
  }
  for (const [property, propertyValues] of Object.entries(values)) {
    for (const value of propertyValues) {
      assert.deepEqual(compareStylexValue({ property, value }), {
        property,
        value,
        covered: true,
        silent: false,
      })
    }
  }
})

test('text decoration shorthands agree with official StyleX', () => {
  const values: Record<string, readonly string[]> = {
    textDecoration: [
      'none',
      'underline',
      'underline overline wavy 2px red',
      'line-through from-font rgb(20 30 40)',
    ],
    textEmphasis: ['none', 'filled sesame', 'open dot red', '"※" currentColor'],
  }
  for (const [property, propertyValues] of Object.entries(values)) {
    for (const value of propertyValues) {
      assert.deepEqual(compareStylexValue({ property, value }), {
        property,
        value,
        covered: true,
        silent: false,
      })
    }
  }
})

test('outline shorthand agrees with official StyleX', () => {
  for (const value of ['none', 'solid', '2px solid #123456', 'thick double invert', 2] as const) {
    assert.deepEqual(compareStylexValue({ property: 'outline', value }), {
      property: 'outline',
      value,
      covered: true,
      silent: false,
    })
  }
})

test('transition shorthand agrees with official StyleX and lowers to the Native runtime', () => {
  for (const value of [
    'opacity 200ms ease-in-out',
    'background-color 150ms linear 50ms',
    'transform 300ms ease-out',
  ]) {
    assert.deepEqual(compareStylexValue({ property: 'transition', value }), {
      property: 'transition',
      value,
      covered: true,
      silent: false,
    })
  }
})

test('list, table, columns, and containment values agree with official StyleX', () => {
  const keywords: Record<string, readonly string[]> = {
    borderCollapse: ['collapse', 'separate'],
    captionSide: ['top', 'bottom', 'block-start', 'block-end', 'inline-start', 'inline-end'],
    columnFill: ['auto', 'balance'],
    columnRuleStyle: [
      'none',
      'hidden',
      'dotted',
      'dashed',
      'solid',
      'double',
      'groove',
      'ridge',
      'inset',
      'outset',
    ],
    columnSpan: ['none', 'all'],
    contentVisibility: ['visible', 'hidden', 'auto'],
    displayInside: ['auto', 'block', 'table', 'flex', 'grid', 'ruby'],
    displayList: ['none', 'list-item'],
    displayOutside: [
      'block-level',
      'inline-level',
      'run-in',
      'contents',
      'none',
      'table-row-group',
      'table-header-group',
      'table-footer-group',
      'table-row',
      'table-cell',
      'table-column-group',
      'table-column',
      'table-caption',
      'ruby-base',
      'ruby-text',
      'ruby-base-container',
      'ruby-text-container',
    ],
    emptyCells: ['show', 'hide'],
    listStylePosition: ['inside', 'outside'],
    listStyleType: [
      'none',
      'disc',
      'circle',
      'square',
      'decimal',
      'decimal-leading-zero',
      'lower-roman',
      'upper-roman',
      'lower-greek',
      'lower-latin',
      'upper-latin',
      'armenian',
      'georgian',
      'lower-alpha',
      'upper-alpha',
    ],
    tableLayout: ['auto', 'fixed'],
  }
  for (const [property, values] of Object.entries(keywords)) {
    for (const value of values) assert.equal(compareStylexValue({ property, value }).covered, true)
  }

  const intrinsicSizes: Record<string, readonly (string | number)[]> = {
    containIntrinsicBlockSize: ['none', 320, 'auto 320px'],
    containIntrinsicHeight: ['none', '20rem', 'auto 20rem'],
    containIntrinsicInlineSize: ['none', 480, 'auto 480px'],
    containIntrinsicSize: ['none', 320, '320px 180px', 'auto 320px auto 180px'],
    containIntrinsicWidth: ['none', '30rem', 'auto 30rem'],
  }
  for (const [property, values] of Object.entries(intrinsicSizes)) {
    for (const value of values) assert.equal(compareStylexValue({ property, value }).covered, true)
  }

  const cases = [
    { property: 'borderSpacing', value: 8 },
    { property: 'borderSpacing', value: '8px 12px' },
    { property: 'clip', value: 'auto' },
    { property: 'clip', value: 'rect(0 10px 10px 0)' },
    { property: 'columnCount', value: 3 },
    { property: 'columnCount', value: 'auto' },
    { property: 'columnRuleColor', value: '#123456' },
    { property: 'columnRuleWidth', value: 'thin' },
    { property: 'columnRuleWidth', value: 2 },
    { property: 'columnWidth', value: 'auto' },
    { property: 'columnWidth', value: '16rem' },
    { property: 'contain', value: 'strict' },
    { property: 'contain', value: 'layout paint' },
    { property: 'contain', value: 'inline-size layout style paint' },
    { property: 'listStyleImage', value: 'none' },
    { property: 'listStyleImage', value: 'url(#marker)' },
  ] as const
  for (const testCase of cases) assert.equal(compareStylexValue(testCase).covered, true)
})

test('modern and legacy fragmentation controls agree with official StyleX', () => {
  const values: Record<string, readonly string[]> = {
    breakAfter: ['auto', 'avoid-page', 'column', 'verso'],
    breakBefore: ['avoid', 'page', 'avoid-column', 'recto'],
    breakInside: ['auto', 'avoid', 'avoid-page', 'avoid-column'],
    pageBreakAfter: ['auto', 'always', 'avoid', 'left', 'recto'],
    pageBreakBefore: ['auto', 'always', 'avoid', 'right', 'verso'],
    pageBreakInside: ['auto', 'avoid'],
  }
  for (const [property, propertyValues] of Object.entries(values)) {
    for (const value of propertyValues) {
      assert.deepEqual(compareStylexValue({ property, value }), {
        property,
        value,
        covered: true,
        silent: false,
      })
    }
  }
})

test('paged, ruby, and bidi typesetting controls agree with official StyleX', () => {
  const values: Record<string, readonly (string | number)[]> = {
    orphans: [1, 3],
    widows: [1, 3],
    rubyAlign: ['start', 'center', 'space-between', 'space-around'],
    rubyMerge: ['separate', 'collapse', 'auto'],
    rubyPosition: ['over', 'under', 'alternate', 'inter-character'],
    unicodeBidi: ['normal', 'embed', 'isolate', 'bidi-override', 'isolate-override', 'plaintext'],
  }
  for (const [property, propertyValues] of Object.entries(values)) {
    for (const value of propertyValues) {
      assert.deepEqual(compareStylexValue({ property, value }), {
        property,
        value,
        covered: true,
        silent: false,
      })
    }
  }
})

test('browser compatibility controls agree with official StyleX', () => {
  const values: Record<string, readonly string[]> = {
    boxDecorationBreak: ['slice', 'clone'],
    imeMode: ['auto', 'normal', 'active', 'inactive', 'disabled'],
    interpolateSize: ['allow-keywords', 'numeric-only'],
    MsOverflowStyle: ['auto', 'none', 'scrollbar', '-ms-autohiding-scrollbar'],
    WebkitBoxOrient: ['vertical', 'horizontal', 'inline-axis', 'block-axis'],
  }
  for (const [property, propertyValues] of Object.entries(values)) {
    for (const value of propertyValues) {
      assert.deepEqual(compareStylexValue({ property, value }), {
        property,
        value,
        covered: true,
        silent: false,
      })
    }
  }
})

test('logical overflow aliases and clip margins agree with official StyleX', () => {
  for (const property of ['overflowBlock', 'overflowBlockX']) {
    for (const value of ['visible', 'hidden', 'clip', 'scroll', 'auto']) {
      assert.deepEqual(compareStylexValue({ property, value }), {
        property,
        value,
        covered: true,
        silent: false,
      })
    }
  }
  for (const value of [0, 4, 'content-box', '4px content-box', 'padding-box 8px']) {
    assert.deepEqual(compareStylexValue({ property: 'overflowClipMargin', value }), {
      property: 'overflowClipMargin',
      value,
      covered: true,
      silent: false,
    })
  }
})

test('hyphenation and MathML layout controls agree with official StyleX', () => {
  const values: Record<string, readonly (string | number)[]> = {
    hyphenateLimitChars: ['auto', 10, '10 3', '10 3 4'],
    lineHeightStep: [0, 4, '0.25rem'],
    mathDepth: [-1, 0, 2, 'auto-add', 'add(-2)', 'add(3)'],
    mathShift: ['normal', 'compact'],
    mathStyle: ['normal', 'compact'],
  }
  for (const [property, propertyValues] of Object.entries(values)) {
    for (const value of propertyValues) {
      assert.deepEqual(compareStylexValue({ property, value }), {
        property,
        value,
        covered: true,
        silent: false,
      })
    }
  }
})

test('image metadata and initial-letter controls agree with official StyleX', () => {
  const values: Record<string, readonly string[]> = {
    imageOrientation: ['from-image', 'none'],
    imageResolution: ['snap', 'from-image', '2dppx', '300dpi snap', 'from-image 2dppx snap'],
    initialLetter: ['normal', '2', '3 2'],
    initialLetterAlign: ['auto', 'alphabetic', 'hanging', 'ideographic'],
    marginTrim: [
      'none',
      'block',
      'block-start',
      'block-end',
      'inline',
      'inline-start',
      'inline-end',
    ],
  }
  for (const [property, propertyValues] of Object.entries(values)) {
    for (const value of propertyValues) {
      assert.deepEqual(compareStylexValue({ property, value }), {
        property,
        value,
        covered: true,
        silent: false,
      })
    }
  }
})

test('scroll and view timeline identifiers agree with official StyleX', () => {
  const values: Record<string, readonly string[]> = {
    scrollTimelineAxis: ['block', 'inline', 'x', 'y'],
    scrollTimelineName: ['none', '--page-scroll', '--x, --y'],
    timelineScope: ['none', 'all', '--page-scroll', '--x, --y'],
    viewTimelineAxis: ['block', 'inline', 'x', 'y'],
    viewTimelineName: ['none', '--card-view', '--x, --y'],
    viewTransitionName: ['none', 'match-element', 'hero-card'],
  }
  for (const [property, propertyValues] of Object.entries(values)) {
    for (const value of propertyValues) {
      assert.deepEqual(compareStylexValue({ property, value }), {
        property,
        value,
        covered: true,
        silent: false,
      })
    }
  }
})

test('anchor positioning identifiers agree with official StyleX', () => {
  const values: Record<string, readonly string[]> = {
    anchorName: ['none', '--tooltip-anchor', '--tooltip-anchor, --fallback-anchor'],
    positionAnchor: ['auto', '--tooltip-anchor'],
    positionVisibility: ['always', 'anchors-visible', 'no-overflow'],
  }
  for (const [property, propertyValues] of Object.entries(values)) {
    for (const value of propertyValues) {
      assert.deepEqual(compareStylexValue({ property, value }), {
        property,
        value,
        covered: true,
        silent: false,
      })
    }
  }
})

test('animation timeline boundaries and view insets agree with official StyleX', () => {
  const values: Record<string, readonly (string | number)[]> = {
    animationTimeline: ['auto', 'none', '--page-scroll', '--page-scroll, --card-view'],
    animationRangeStart: ['normal', 0, '20%', 'entry', 'entry 20%', 'exit-crossing 80%'],
    animationRangeEnd: ['normal', 100, '80%', 'exit', 'exit 80%', 'entry-crossing 20%'],
    viewTimelineInset: ['auto', 0, '10%', 'auto 10%', '1rem 20%'],
  }
  for (const [property, propertyValues] of Object.entries(values)) {
    for (const value of propertyValues) {
      assert.deepEqual(compareStylexValue({ property, value }), {
        property,
        value,
        covered: true,
        silent: false,
      })
    }
  }
})

test('timeline shorthands agree with their official StyleX longhand semantics', () => {
  const cases = [
    { property: 'animationRange', value: 'entry 20% exit 80%' },
    { property: 'animationRange', value: '20% 80%' },
    { property: 'animationRange', value: 'entry 20%' },
    { property: 'scrollTimeline', value: '--page-scroll y' },
    { property: 'scrollTimeline', value: 'inline --page-scroll' },
    { property: 'viewTimeline', value: '--card-view inline auto 10%' },
    { property: 'viewTimeline', value: '10% --card-view y' },
  ] as const
  for (const testCase of cases) assert.equal(compareStylexValue(testCase).covered, true)
})

test('masonry track alignment controls agree with official StyleX', () => {
  const values: Record<string, readonly string[]> = {
    alignTracks: ['normal', 'stretch', 'center', 'baseline', 'space-between', 'space-evenly'],
    justifyTracks: ['normal', 'stretch', 'center', 'left', 'right', 'space-around'],
    masonryAutoFlow: [
      'pack',
      'next',
      'definite-first',
      'ordered',
      'pack definite-first',
      'next ordered',
    ],
  }
  for (const [property, propertyValues] of Object.entries(values)) {
    for (const value of propertyValues) {
      assert.deepEqual(compareStylexValue({ property, value }), {
        property,
        value,
        covered: true,
        silent: false,
      })
    }
  }
})

test('list and column shorthands agree with official StyleX', () => {
  const cases = [
    { property: 'columns', value: 'auto' },
    { property: 'columns', value: 16 },
    { property: 'columns', value: '3' },
    { property: 'columns', value: '16rem 3' },
    { property: 'columns', value: '3 16rem' },
    { property: 'columnRule', value: 'solid' },
    { property: 'columnRule', value: 2 },
    { property: 'columnRule', value: '#123456' },
    { property: 'columnRule', value: '2px dashed #123456' },
    { property: 'listStyle', value: 'disc' },
    { property: 'listStyle', value: 'inside' },
    { property: 'listStyle', value: 'none' },
    { property: 'listStyle', value: 'disc inside' },
    { property: 'listStyle', value: 'url(#marker) outside square' },
    { property: 'listStyle', value: 'inherit' },
  ] as const
  for (const testCase of cases) assert.equal(compareStylexValue(testCase).covered, true)
})

test('physical scroll shorthands agree with official StyleX', () => {
  const cases = [
    { property: 'scrollMargin', value: 8 },
    { property: 'scrollMargin', value: '8px 12px' },
    { property: 'scrollMargin', value: '8px 12px 16px' },
    { property: 'scrollMargin', value: '8px 12px 16px 20px' },
    { property: 'scrollPadding', value: 8 },
    { property: 'scrollPadding', value: '8px 12px' },
    { property: 'scrollPadding', value: '8px 12px 16px' },
    { property: 'scrollPadding', value: '8px 12px 16px 20px' },
  ] as const
  for (const testCase of cases) assert.equal(compareStylexValue(testCase).covered, true)
})

test('logical scroll shorthands agree with official StyleX', () => {
  const cases = [
    { property: 'scrollMarginBlock', value: 8 },
    { property: 'scrollMarginBlock', value: '8px 12px' },
    { property: 'scrollMarginInline', value: -4 },
    { property: 'scrollMarginInline', value: '8px 12px' },
    { property: 'scrollPaddingBlock', value: 8 },
    { property: 'scrollPaddingBlock', value: '8px 12px' },
    { property: 'scrollPaddingInline', value: 8 },
    { property: 'scrollPaddingInline', value: '8px 12px' },
  ] as const
  for (const testCase of cases) assert.equal(compareStylexValue(testCase).covered, true)
})

test('flex, container, and grid gap shorthands agree with official StyleX', () => {
  const cases = [
    { property: 'flexFlow', value: 'row' },
    { property: 'flexFlow', value: 'wrap' },
    { property: 'flexFlow', value: 'column wrap' },
    { property: 'flexFlow', value: 'wrap-reverse row-reverse' },
    { property: 'container', value: 'card-shell' },
    { property: 'container', value: 'card-shell / normal' },
    { property: 'container', value: 'card-shell / inline-size' },
    { property: 'gridGap', value: 8 },
    { property: 'gridGap', value: '8px 12px' },
    { property: 'gridRowGap', value: 8 },
    { property: 'gridColumnGap', value: 12 },
  ] as const
  for (const testCase of cases) assert.equal(compareStylexValue(testCase).covered, true)
})

test('border axis longhands agree with official StyleX', () => {
  const properties = new Set([
    'borderBlockWidth',
    'borderBlockStartWidth',
    'borderBlockEndWidth',
    'borderInlineWidth',
    'borderInlineStartWidth',
    'borderInlineEndWidth',
    'borderInlineColor',
    'borderInlineStartColor',
    'borderInlineEndColor',
    'borderBlockStyle',
    'borderBlockStartStyle',
    'borderBlockEndStyle',
    'borderInlineStyle',
    'borderInlineStartStyle',
    'borderInlineEndStyle',
    'borderTopStyle',
    'borderRightStyle',
    'borderBottomStyle',
    'borderLeftStyle',
  ])
  const cases = STYLEX_VALUE_CASES.filter(({ property }) => properties.has(property))
  assert.equal(cases.length, properties.size)
  for (const testCase of cases) assert.equal(compareStylexValue(testCase).covered, true)
})
