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
    values: { total: 166, covered: 166 },
    constructs: { total: 14, covered: 14 },
    corpus: { total: 123, covered: 123 },
    silent: 0,
  })
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
