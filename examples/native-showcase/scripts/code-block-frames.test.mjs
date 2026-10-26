import assert from 'node:assert/strict'
import test from 'node:test'
import { assertReusableCodeInputs, frameSummary, timingRecords } from './code-block-frames.mjs'

test('a reused timing APK permits docs/collector changes but rejects different app or build inputs', () => {
  assertReusableCodeInputs([
    'docs/measurements/report.md',
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
