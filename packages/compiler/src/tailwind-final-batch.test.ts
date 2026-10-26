import assert from 'node:assert/strict'
import test from 'node:test'
import type { PreparedModule } from './index.ts'
import { emitFinalTailwindBatch, TailwindBatchIncomplete } from './tailwind-final-batch.ts'

function handle() {
  let disposals = 0
  const module: PreparedModule<string> = {
    get candidates() {
      throw new Error('unaccepted module must not be inspected')
    },
    emit() {
      throw new Error('invalid batch must not emit')
    },
    dispose() {
      disposals++
    },
  }
  return {
    module,
    get disposals() {
      return disposals
    },
  }
}

test('missing/stale module claims reject before candidate collection and release every handle once', async () => {
  const old = handle(),
    deleted = handle()
  let preparations = 0
  await assert.rejects(
    emitFinalTailwindBatch({
      expected: [
        { id: 'a', revision: 'new' },
        { id: 'missing', revision: 'new' },
      ],
      collected: [
        { id: 'a', revision: 'old', module: old.module },
        { id: 'deleted', revision: 'old', module: deleted.module },
      ],
      runtime: { expected: [], contributions: [] },
      async prepare() {
        preparations++
        return ''
      },
    }),
    (error) => {
      assert.ok(error instanceof TailwindBatchIncomplete)
      assert.equal(error.code, 'TAILWIND_BATCH_INCOMPLETE')
      assert.deepEqual(
        error.issues.map(({ id, kind }) => [id, kind]),
        [
          ['a', 'stale'],
          ['missing', 'missing'],
        ],
      )
      return true
    },
  )
  assert.equal(preparations, 0)
  assert.equal(old.disposals, 1)
  assert.equal(deleted.disposals, 1)
})

test('duplicate handles and ambiguous current module observations are rejected rather than emitted twice', async () => {
  const shared = handle()
  const common = {
    runtime: { expected: [], contributions: [] },
    async prepare() {
      throw new Error('must not prepare')
    },
  }
  await assert.rejects(
    emitFinalTailwindBatch({
      ...common,
      expected: [
        { id: 'a', revision: 'one' },
        { id: 'b', revision: 'one' },
      ],
      collected: [
        { id: 'a', revision: 'one', module: shared.module },
        { id: 'b', revision: 'one', module: shared.module },
      ],
    }),
    TailwindBatchIncomplete,
  )
  assert.equal(shared.disposals, 1)
  const left = handle(),
    right = handle()
  await assert.rejects(
    emitFinalTailwindBatch({
      ...common,
      expected: [{ id: 'a', revision: 'one' }],
      collected: [
        { id: 'a', revision: 'one', module: left.module },
        { id: 'a', revision: 'one', module: right.module },
      ],
    }),
    TailwindBatchIncomplete,
  )
  assert.equal(left.disposals, 1)
  assert.equal(right.disposals, 1)
})

test('invalid runtime scan facts prevent partial publication even with a current retained module', async () => {
  const current = handle()
  await assert.rejects(
    emitFinalTailwindBatch({
      expected: [{ id: 'current', revision: 'one' }],
      collected: [{ id: 'current', revision: 'one', module: current.module }],
      runtime: {
        expected: [{ id: 'runtime', revision: 'one' }],
        contributions: [{ id: 'runtime', revision: 'one', record: '{}' }],
      },
      async prepare() {
        throw new Error('must not prepare')
      },
    }),
    (error) => {
      assert.ok(error instanceof TailwindBatchIncomplete)
      assert.deepEqual(
        error.issues.map(({ id, kind, message }) => [id, kind, message]),
        [['runtime', 'runtime-incomplete', 'invalid']],
      )
      return true
    },
  )
  assert.equal(current.disposals, 1)
})

test('configuration and already-cancelled batches release ownership without preparing', async () => {
  const common = {
    runtime: { expected: [], contributions: [] },
    async prepare() {
      throw new Error('must not prepare')
    },
  }
  const duplicate = handle()
  await assert.rejects(
    emitFinalTailwindBatch({
      ...common,
      expected: [
        { id: 'a', revision: 'one' },
        { id: 'a', revision: 'one' },
      ],
      collected: [{ id: 'a', revision: 'one', module: duplicate.module }],
    }),
    /unique IDs/,
  )
  assert.equal(duplicate.disposals, 1)
  const cancelled = handle(),
    controller = new AbortController()
  const reason = new Error('epoch closed')
  controller.abort(reason)
  await assert.rejects(
    emitFinalTailwindBatch({
      ...common,
      signal: controller.signal,
      expected: [{ id: 'a', revision: 'one' }],
      collected: [{ id: 'a', revision: 'one', module: cancelled.module }],
    }),
    (error) => error === reason,
  )
  assert.equal(cancelled.disposals, 1)
})
