import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  compareStylexValue,
  STYLEX_VALUE_CASES,
  stylexPracticalScorecard,
} from './stylex-practical.ts'

test('the practical StyleX scorecard is measured from executable fixtures', () => {
  const score = stylexPracticalScorecard()
  assert.deepEqual(score, {
    values: { total: 49, covered: 49 },
    constructs: { total: 14, covered: 11 },
    corpus: { total: 49, covered: 49 },
    silent: 0,
  })
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
