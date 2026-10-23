import assert from 'node:assert/strict'
import test from 'node:test'
import { compareOrderCosts, summarizeOrderSamples } from './tailwind-order-cost.ts'

test('cost summaries retain all samples and never use a best-run minimum as the median', () => {
  assert.deepEqual(summarizeOrderSamples([10, 1, 5, 7, 3], 20), {
    operations: 20,
    medianMs: 5,
    p90Ms: 10,
    samplesMs: [10, 1, 5, 7, 3],
  })
  assert.throws(() => summarizeOrderSamples([], 20))
  assert.throws(() => summarizeOrderSamples([Number.NaN], 20))
})

test('comparisons reject incompatible contexts or missing build receipts, not slow clock samples', () => {
  // Synthetic comparison data only; this test is not a build receipt or a
  // performance capture, and the CLI obtains its own fresh evidence.
  const report = () => ({
    schema: 1,
    context: { corpus: 'same', profile: 'debug' },
    rebuiltForCapture: true,
    preparation: { medianMs: 1 },
    compilation: { web: { medianMs: 1 }, native: { medianMs: 2 } },
    tables: [
      {
        candidateCount: 10,
        cold: { medianMs: 1 },
        cached: { medianMs: 1 },
        states: { medianMs: 1 },
        consumerBundleBytes: { gzip: 100 },
      },
    ],
  })
  const before = report(),
    after = report()
  after.compilation.native.medianMs = 4
  const result = compareOrderCosts(before, after)
  assert.equal(result.compileNative.percent, 100)
  assert.equal(result.tables[0].consumerGzip.delta, 0)
  assert.throws(
    () => compareOrderCosts(before, { ...after, rebuiltForCapture: false }),
    /fresh build/,
  )
  assert.throws(
    () =>
      compareOrderCosts(before, { ...after, context: { ...after.context, corpus: 'different' } }),
    /incompatible/,
  )
  assert.throws(() => compareOrderCosts(before, { ...after, schema: 2 }), /schema/)
})
