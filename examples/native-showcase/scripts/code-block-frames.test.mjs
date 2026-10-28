import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertReusableCodeInputs,
  frameSummary,
  STALE_AFTER_MS,
  timingRecords,
  waitForCompletedFrames,
} from './code-block-frames.mjs'

test('a reused timing APK permits docs/collector changes but rejects different app or build inputs', () => {
  assertReusableCodeInputs([
    'docs/measurements/report.md',
    'examples/screen-readers/expected/nvda/patterns-codeblock--default.txt',
    'examples/native-showcase/scripts/code-block-performance.mjs',
  ])
  for (const name of [
    'examples/native-showcase/src/CodeBlockPerformance.stories.tsx',
    'examples/native-showcase/src/code-block-fixture.ts',
    'packages/patterns/src/code-block.native.tsx',
    'pnpm-lock.yaml',
    '.github/workflows/native-showcase.yml',
    'examples/native-showcase/app.json',
  ])
    assert.throws(() => assertReusableCodeInputs([name]), /different application/)
})

const frame = (flags, completed) => `${flags},1,100000000,100000000,${completed},`
const dump = (rows, total = rows.length) =>
  `Total frames rendered: ${total}\nJanky frames: 1 (25%)\n---PROFILEDATA---\nFlags,FrameTimelineVsyncId,IntendedVsync,Vsync,FrameCompleted,\n${rows.join('\n')}\n---PROFILEDATA---`

test('Android frame parser keeps flagged/pending rows and exposes truncated windows', () => {
  const result = frameSummary(
    dump(
      [
        frame(0, 110000000),
        frame(0, 125000000),
        frame(1, 140000000),
        frame(0, '9223372036854775807'),
      ],
      200,
    ),
    60,
  )
  assert.equal(result.ordinaryFrames, 2)
  assert.equal(result.overBudgetFrames, 1)
  assert.equal(result.flaggedFrames, 1)
  assert.equal(result.pendingFrames, 1)
  assert.equal(result.p95Ms, 25)
  assert.equal(result.rows[2].durationMs, 40)
  assert.equal(result.rows[3].durationMs, null)
  assert.equal(result.recentWindowOnly, true)
  assert.equal(result.aggregate.total, 200)
  assert.equal(frameSummary(dump([frame(0, 110000000)]), 120).overBudgetFrames, 1)
})

test('empty or incomplete measurements cannot masquerade as fast frames', () => {
  assert.throws(() => frameSummary('', 60), /no frame rows/)
  assert.throws(() => frameSummary(dump([frame(1, 110000000)]), 60), /no ordinary/)
  assert.throws(() => frameSummary(dump([frame(0, 110000000)]), 0), /refresh/)
  assert.throws(() => frameSummary('Flags,IntendedVsync,\n0,1,', 60), /FrameCompleted/)
})

test('only actual probe JSON is read; malformed timing evidence fails', () => {
  assert.deepEqual(
    timingRecords(
      'noise\nI ReactNativeJS: [Hozo CodeBlock timing] {"name":"scroll","rafGapsMs":[20]}',
    ),
    [{ name: 'scroll', rafGapsMs: [20] }],
  )
  assert.throws(() => timingRecords('[Hozo CodeBlock timing] garbage'))
  const chunk = '[Hozo CodeBlock raf] {"name":"scroll","chunk":0,"gaps":[20,30]}\n'
  const summary = '[Hozo CodeBlock timing] {"name":"scroll","rafCount":2,"rafChunks":1}'
  assert.deepEqual(timingRecords(chunk + summary)[0].rafGapsMs, [20, 30])
  assert.throws(() => timingRecords(summary), /chunks missing/)
  assert.throws(() => timingRecords(chunk.replace('[20,30]', '[20]') + summary), /samples missing/)
})

test('release Android console quoting preserves the actual first-mount observation', () => {
  // Retained from run 40273502178, before the collector format fix.
  const log = `I/ReactNativeJS( 2518): '[Hozo CodeBlock raf]', '{"name":"mount-10","chunk":0,"gaps":[43.306798000005074,10.56211600000097]}'
I/ReactNativeJS( 2518): '[Hozo CodeBlock timing]', '{"name":"mount-10","boundary":"native-layout-callback","elapsedMs":54.20073300000513,"rafCount":2,"rafChunks":1,"offset":0,"maxOffset":0,"count":10,"tick":0}'`
  const [record] = timingRecords(log)
  assert.equal(record.count, 10)
  assert.equal(record.elapsedMs, 54.20073300000513)
  assert.deepEqual(record.rafGapsMs, [43.306798000005074, 10.56211600000097])
})

test('frame completion polls only observations, retains pending data and keeps the original deadline', async () => {
  let clock = 0
  const retained = []
  const pending = dump([frame(0, 90000000)])
  const complete = dump([frame(0, 125000000)])
  const result = await waitForCompletedFrames({
    read: () => (clock < 200 ? pending : complete),
    retain: (_, value) => retained.push(value),
    deadline: 300,
    refreshHz: 60,
    now: () => clock,
    sleep: async (ms) => {
      clock += ms
    },
  })
  assert.equal(result.summary.p95Ms, 25)
  assert.deepEqual(retained, [pending, pending, complete])
  clock = 0
  await assert.rejects(
    () =>
      waitForCompletedFrames({
        read: () => pending,
        retain: () => {},
        deadline: 250,
        refreshHz: 60,
        now: () => clock,
        sleep: async (ms) => {
          clock += ms
        },
      }),
    /original measurement window/,
  )
  assert.equal(clock, 250)
})

test('only an inverted row frozen for STALE_AFTER_MS before the deadline is stale (#1381)', async () => {
  // As in run 40695244453: one row whose completion predates its vsync,
  // unchanged for the whole window, beside frames that did complete.
  const frozen = frame(0, 90000000)
  const run = (read, deadline) => {
    let clock = 0
    return waitForCompletedFrames({
      read: () => read(clock),
      retain: () => {},
      deadline,
      refreshHz: 60,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms
      },
    })
  }
  const result = await run(() => dump([frame(0, 110000000), frozen]), STALE_AFTER_MS + 100)
  assert.equal(result.summary.pendingFrames, 0)
  assert.equal(result.summary.stalePendingFrames, 1)
  assert.equal(result.summary.ordinaryFrames, 1)
  assert.equal(result.summary.rows[1].durationMs, null)
  // Still waits out the whole window first: a row is not stale on sight.
  assert.ok(result.observations > STALE_AFTER_MS / 100)

  // Frozen, but not for long enough.
  await assert.rejects(
    () => run(() => dump([frame(0, 110000000), frozen]), STALE_AFTER_MS - 100),
    /original measurement window/,
  )
  // Never completed at all is not the inverted case, however long it sits.
  await assert.rejects(
    () =>
      run(() => dump([frame(0, 110000000), frame(0, '9223372036854775807')]), STALE_AFTER_MS + 100),
    /original measurement window/,
  )
  // An inverted row that keeps being rewritten is in flight, not frozen.
  await assert.rejects(
    () =>
      run(
        (clock) => dump([frame(0, 110000000), frame(0, 90000000 - (clock % 1000))]),
        STALE_AFTER_MS + 100,
      ),
    /original measurement window/,
  )
  // A frozen row next to one that is merely late still fails.
  await assert.rejects(
    () =>
      run(
        (clock) => dump([frame(0, 110000000), frozen, frame(0, 80000000 + clock)]),
        STALE_AFTER_MS + 100,
      ),
    /original measurement window/,
  )
})
