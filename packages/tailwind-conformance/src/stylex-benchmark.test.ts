import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  compareStylexBenchmark,
  type StylexBenchmarkResult,
  validateStylexBenchmarkCorpus,
} from './stylex-benchmark.ts'

const baseline: StylexBenchmarkResult = {
  schemaVersion: 1,
  corpusHash: 'fixed-corpus',
  iterationsPerSample: 200,
  samples: 9,
  medianMsPerPair: 1,
  pairsPerSecond: 1000,
}

test('the StyleX benchmark corpus settles without residual StyleX work', () => {
  validateStylexBenchmarkCorpus()
})

test('the StyleX benchmark comparison permits at most five percent regression', () => {
  assert.equal(
    compareStylexBenchmark({ ...baseline, medianMsPerPair: 1.05 }, baseline).passed,
    true,
  )
  assert.equal(
    compareStylexBenchmark({ ...baseline, medianMsPerPair: 1.051 }, baseline).passed,
    false,
  )
})

test('the StyleX benchmark rejects a baseline for another corpus', () => {
  assert.throws(
    () => compareStylexBenchmark({ ...baseline, corpusHash: 'changed' }, baseline),
    /different schema or corpus/,
  )
})
