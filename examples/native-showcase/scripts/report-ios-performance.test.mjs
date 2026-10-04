import assert from 'node:assert/strict'
import test from 'node:test'
import { summarizeIosPerformance } from './report-ios-performance.mjs'

test('performance report keeps submission and pixel timing separate, with source and comparison provenance', () => {
  const log = [
    'noise',
    `'[Hozo Kumimono]', '{"phase":"render-start","progress":0}'`,
    `'[Hozo Kumimono]', '{"phase":"render-return","progress":0,"intervalSubmittedFrames":80,"intervalJsSubmitMs":300}'`,
    `'[Hozo Kumimono]', '{"phase":"submission-policy","progress":0,"submitted":9,"coalesced":72}'`,
  ].join('\n')
  const summary = summarizeIosPerformance(log, {
    passed: true,
    scenario: 'canvas',
    canvasMode: 'paced',
    diagnostic: false,
    binaryRun: 'new-build',
    driverCommit: 'source',
    canvasObservation: { disassemblyWaitMs: 215_036 },
  })
  assert.equal(summary.endpoints.length, 1)
  assert.equal(summary.endpoints[0].intervalJsSubmitMs, 300)
  assert.equal(summary.pixelWaits.disassemblyWaitMs, 215_036)
  assert.equal(summary.submissionPolicy[0].coalesced, 72)
  assert.equal(summary.canvasMode, 'paced')
  assert.equal(summary.binaryRun, 'new-build')
  assert.equal(summary.functionalPassed, true)
  assert.equal(summary.performanceCertified, false)
  assert.deepEqual(summary.parseErrors, [])
})

test('failed or missing measurements are never reported as functional/performance success', () => {
  const report = summarizeIosPerformance('', { passed: false, error: 'pixel timeout' })
  assert.equal(report.functionalPassed, false)
  assert.equal(report.performanceCertified, false)
  assert.deepEqual(report.endpoints, [])
  assert.deepEqual(report.submissionPolicy, [])
})

test('truncated native logs retain parse errors rather than inventing endpoint measurements', () => {
  const report = summarizeIosPerformance(`'[Hozo Kumimono]', '{"phase":"render-return"`, {})
  assert.equal(report.parseErrors.length, 1)
  assert.equal(report.parseErrors[0].line, 1)
  assert.deepEqual(report.endpoints, [])
})
