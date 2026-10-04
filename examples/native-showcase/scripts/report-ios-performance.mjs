import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SAMPLE_PHASES = ['cold', 'disassembly', 'reassembly']

/** A collector exiting zero only means it retained its result, not that sample
 * succeeded. Read the actual observation and require a nonempty stack file. */
export function readIosRenderSamples(output) {
  return SAMPLE_PHASES.map((phase) => {
    const directory = resolve(output, `render-${phase}-stacks`)
    try {
      const observation = JSON.parse(readFileSync(resolve(directory, 'sampling.json'), 'utf8'))
      if (observation?.completed !== true || observation.error) {
        return { phase, status: 'failed', observation }
      }
      const stack = resolve(directory, 'sample.txt')
      const file = existsSync(stack) ? statSync(stack) : undefined
      if (!file?.isFile() || file.size === 0) {
        return { phase, status: 'failed', observation, error: 'Native stack file missing or empty' }
      }
      return { phase, status: 'complete', observation }
    } catch (error) {
      return { phase, status: 'unavailable', error: error.message }
    }
  })
}

export function summarizeIosPerformance(log, evidence, samples = []) {
  const events = []
  const parseErrors = []
  for (const [index, line] of log.split('\n').entries()) {
    const prefix = line.indexOf('[Hozo Kumimono]')
    if (prefix < 0) continue
    const start = line.indexOf('{', prefix)
    if (start < 0) continue
    try {
      const event = JSON.parse(line.slice(start, line.lastIndexOf('}') + 1))
      if (['render-return', 'submission-policy', 'context-identity'].includes(event.phase))
        events.push(event)
    } catch (error) {
      parseErrors.push({ line: index + 1, error: error.message })
    }
  }
  return {
    measurement:
      'CPU-side render submissions and host screenshot waits; not GPU timestamps or queue depth',
    scenario: evidence.scenario,
    canvasMode: evidence.canvasMode,
    binaryRun: evidence.binaryRun,
    driverCommit: evidence.driverCommit,
    jsBundleCommit: evidence.jsBundleCommit,
    diagnostic: evidence.diagnostic,
    functionalPassed: evidence.passed === true,
    performanceCertified: false,
    endpoints: events.filter(({ phase }) => phase === 'render-return'),
    submissionPolicy: events.filter(({ phase }) => phase === 'submission-policy'),
    contextIdentity: events.filter(({ phase }) => phase === 'context-identity'),
    renderProfiling:
      evidence.canvasMode === 'profile' || evidence.renderProfiling
        ? {
            ...evidence.renderProfiling,
            // Independent of functionalPassed, GL identity, and child exit codes.
            samplingComplete:
              samples.length === SAMPLE_PHASES.length &&
              SAMPLE_PHASES.every((phase) =>
                samples.some((sample) => sample.phase === phase && sample.status === 'complete'),
              ),
            samples,
          }
        : undefined,
    pixelWaits: evidence.canvasObservation,
    parseErrors,
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = resolve(process.argv[2] ?? 'artifacts/native-showcase-ios')
  const evidenceFile = resolve(output, 'evidence.json')
  if (existsSync(evidenceFile)) {
    const logFile = resolve(output, 'syslog.txt')
    const evidence = JSON.parse(readFileSync(evidenceFile, 'utf8'))
    const summary = summarizeIosPerformance(
      existsSync(logFile) ? readFileSync(logFile, 'utf8') : '',
      evidence,
      evidence.canvasMode === 'profile' || evidence.renderProfiling
        ? readIosRenderSamples(output)
        : [],
    )
    writeFileSync(resolve(output, 'performance.json'), `${JSON.stringify(summary, null, 2)}\n`)
    console.log(`[native-showcase] performance summary: ${summary.endpoints.length} endpoints`)
    if (summary.renderProfiling && !summary.renderProfiling.samplingComplete) {
      console.warn(
        '[native-showcase] native stack sampling incomplete; see performance.json errors',
      )
    }
  } else {
    console.log('[native-showcase] no iOS smoke evidence (setup/build did not reach measurement)')
  }
}
