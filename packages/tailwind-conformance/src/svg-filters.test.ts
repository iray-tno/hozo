import assert from 'node:assert/strict'
import test from 'node:test'
import { svgFilterScorecard } from './svg-filters.ts'

test('filter API/compiler coverage uses upstream public exports, not the implemented shortlist', () => {
  const score = svgFilterScorecard()
  assert.equal(score.web.total, 26)
  assert.equal(score.native.total, 10)
  assert.equal(score.native.upstreamStubs, 16)
  assert.deepEqual(
    score.rows.filter((row) => row.web).map((row) => row.name),
    ['FeColorMatrix', 'FeGaussianBlur', 'Filter'],
  )
  assert.deepEqual(
    score.rows.filter((row) => row.native).map((row) => row.name),
    ['FeColorMatrix', 'FeGaussianBlur', 'Filter'],
  )
  assert.equal(score.rows.find((row) => row.name === 'FeDistantLight')?.upstreamNative, 'stub')
  assert.equal(score.rows.find((row) => row.name === 'FeMergeNode')?.upstreamNative, 'backed')
  assert.equal(score.rows.find((row) => row.name === 'FeDropShadow')?.web, false)
})
