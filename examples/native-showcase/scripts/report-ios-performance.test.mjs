import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { readIosRenderSamples, summarizeIosPerformance } from './report-ios-performance.mjs'

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
  assert.equal(summary.renderProfiling, undefined)
})

function withSamples(run) {
  const output = mkdtempSync(join(tmpdir(), 'hozo-ios-report-'))
  const save = (phase, observation, stack) => {
    const directory = join(output, `render-${phase}-stacks`)
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'sampling.json'), JSON.stringify(observation))
    if (stack !== undefined) writeFileSync(join(directory, 'sample.txt'), stack)
    return directory
  }
  try {
    run(output, save)
  } finally {
    rmSync(output, { recursive: true, force: true })
  }
}

test('zero-exit collectors with all three real timeouts remain failed sampling, independently of functional success', () => {
  withSamples((output, save) => {
    const collectors = ['cold', 'disassembly', 'reassembly'].map((phase) => {
      save(phase, { completed: false, error: 'spawnSync /usr/bin/sample ETIMEDOUT', pid: 1234 })
      return { phase, code: 0, signal: null }
    })
    const report = summarizeIosPerformance(
      '',
      {
        canvasMode: 'profile',
        passed: true,
        renderProfiling: { collectors, timingPerturbed: true },
      },
      readIosRenderSamples(output),
    )
    assert.equal(report.functionalPassed, true)
    assert.equal(report.renderProfiling.samplingComplete, false)
    assert.deepEqual(report.renderProfiling.collectors, collectors)
    assert.equal(report.renderProfiling.samples.length, 3)
    for (const sample of report.renderProfiling.samples) {
      assert.equal(sample.status, 'failed')
      assert.match(sample.observation.error, /ETIMEDOUT/)
    }
  })
})

test('sampling is complete only when every requested phase has a successful observation and nonempty stack', () => {
  withSamples((output, save) => {
    for (const phase of ['cold', 'disassembly', 'reassembly'])
      save(phase, { completed: true, pid: 1234 }, 'native thread stack')
    const report = summarizeIosPerformance(
      '',
      { canvasMode: 'profile' },
      readIosRenderSamples(output),
    )
    assert.equal(report.renderProfiling.samplingComplete, true)
    assert.equal(report.performanceCertified, false)
    assert.equal(report.functionalPassed, false)
  })
})

test('missing, empty and malformed sampling evidence cannot become diagnostic success', () => {
  withSamples((output, save) => {
    const directory = save('cold', { completed: true })
    save('disassembly', { completed: true }, '')
    writeFileSync(join(directory, 'sampling.json'), '{truncated')
    const samples = readIosRenderSamples(output)
    assert.deepEqual(
      samples.map(({ status }) => status),
      ['unavailable', 'failed', 'unavailable'],
    )
    assert.ok(samples.every(({ error }) => error))
    assert.equal(
      summarizeIosPerformance('', { canvasMode: 'profile' }, samples).renderProfiling
        .samplingComplete,
      false,
    )
  })
})

test('completed flag without a stack, or without results, does not certify sampling', () => {
  withSamples((output, save) => {
    save('cold', { completed: true })
    assert.equal(readIosRenderSamples(output)[0].status, 'failed')
    assert.equal(
      summarizeIosPerformance('', { canvasMode: 'profile' }).renderProfiling.samplingComplete,
      false,
    )
  })
})

test('actual report CLI reads retained timeout files even when all collector exit codes are zero', () => {
  withSamples((output, save) => {
    const collectors = ['cold', 'disassembly', 'reassembly'].map((phase) => {
      save(phase, { completed: false, error: 'sample ETIMEDOUT' })
      return { phase, code: 0 }
    })
    writeFileSync(
      join(output, 'evidence.json'),
      JSON.stringify({
        passed: true,
        canvasMode: 'profile',
        renderProfiling: { collectors },
      }),
    )
    const identity = {
      phase: 'context-identity',
      parameters: { RENDERER: 'Apple Software Renderer' },
    }
    writeFileSync(join(output, 'syslog.txt'), `[Hozo Kumimono] ${JSON.stringify(identity)}`)
    const log = execFileSync(
      process.execPath,
      [fileURLToPath(new URL('./report-ios-performance.mjs', import.meta.url)), output],
      { timeout: 10_000 },
    ).toString()
    assert.match(log, /performance summary/)
    const report = JSON.parse(readFileSync(join(output, 'performance.json')))
    assert.equal(report.functionalPassed, true)
    assert.equal(report.renderProfiling.samplingComplete, false)
    assert.equal(
      report.renderProfiling.samples.filter(({ status }) => status === 'failed').length,
      3,
    )
    assert.deepEqual(report.contextIdentity, [identity])
  })
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

test('diagnostic GL identity and profiler perturbation remain separate from submission timing', () => {
  const identity = {
    phase: 'context-identity',
    parameters: { RENDERER: 'unknown renderer' },
    queryMs: 12,
    errors: {},
    timingPerturbed: true,
  }
  const report = summarizeIosPerformance(`[Hozo Kumimono] ${JSON.stringify(identity)}`, {
    canvasMode: 'profile',
    diagnostic: true,
    renderProfiling: { timingPerturbed: true },
  })
  assert.deepEqual(report.contextIdentity, [identity])
  assert.deepEqual(report.endpoints, [])
  assert.equal(report.renderProfiling.timingPerturbed, true)
  assert.equal(report.performanceCertified, false)
  assert.deepEqual(summarizeIosPerformance('', {}).contextIdentity, [])
})
