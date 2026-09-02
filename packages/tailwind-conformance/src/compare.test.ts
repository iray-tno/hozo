import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compareCandidate } from './compare.ts'

test('the shared zero-specificity View base is not attributed to a utility', () => {
  assert.deepEqual(compareCandidate('opacity-50', 'opacity: 0.5;', new Map()), {
    candidate: 'opacity-50',
    verdict: 'MATCH',
    textual: false,
  })
})
