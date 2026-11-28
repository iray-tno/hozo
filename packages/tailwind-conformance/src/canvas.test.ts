import assert from 'node:assert/strict'
import test from 'node:test'

import { compareCanvasCandidate } from './canvas.ts'

test('Canvas paint lowers palette alpha modifiers on both Web and Native', () => {
  const web = compareCanvasCandidate('fill-blue-500/50', false)
  assert.equal(web.verdict, 'COVERED')
  assert.equal(web.replacement, 'fill="oklch(62.3% 0.214 259.815 / 0.5)"')

  const native = compareCanvasCandidate('fill-blue-500/50', true)
  assert.equal(native.verdict, 'COVERED')
  assert.equal(native.replacement, 'fill="rgba(43, 127, 255, 0.5)"')
})

test('Canvas paint refuses unknown tokens and CSS-inherited colour keywords', () => {
  for (const candidate of [
    'fill-unknown-999',
    'stroke-brand/50',
    'fill-current',
    'fill-inherit',
    'stroke-current',
    'stroke-inherit',
  ]) {
    for (const native of [false, true]) {
      const result = compareCanvasCandidate(candidate, native)
      assert.equal(result.verdict, 'REFUSED', `${candidate} (native=${native})`)
    }
  }
})
