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
    values: { total: 67, covered: 67 },
    constructs: { total: 14, covered: 14 },
    corpus: { total: 67, covered: 67 },
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
      'normal', 'ultra-condensed', 'extra-condensed', 'condensed',
      'semi-condensed', 'semi-expanded', 'expanded', 'extra-expanded',
      'ultra-expanded',
    ],
    fontSynthesisPosition: ['auto', 'none'],
    fontSynthesisSmallCaps: ['auto', 'none'],
    fontSynthesisStyle: ['auto', 'none'],
    fontSynthesisWeight: ['auto', 'none'],
    fontVariantCaps: [
      'normal', 'small-caps', 'all-small-caps', 'petite-caps',
      'all-petite-caps', 'unicase', 'titling-caps',
    ],
    fontVariantLigatures: ['normal', 'none'],
    fontVariantNumeric: [
      'normal', 'lining-nums', 'oldstyle-nums', 'proportional-nums',
      'tabular-nums', 'diagonal-fractions', 'stacked-fractions', 'ordinal',
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
