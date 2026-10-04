import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function summarizeIosPerformance(log, evidence) {
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
    renderProfiling: evidence.renderProfiling,
    pixelWaits: evidence.canvasObservation,
    parseErrors,
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = resolve(process.argv[2] ?? 'artifacts/native-showcase-ios')
  const evidenceFile = resolve(output, 'evidence.json')
  if (existsSync(evidenceFile)) {
    const logFile = resolve(output, 'syslog.txt')
    const summary = summarizeIosPerformance(
      existsSync(logFile) ? readFileSync(logFile, 'utf8') : '',
      JSON.parse(readFileSync(evidenceFile, 'utf8')),
    )
    writeFileSync(resolve(output, 'performance.json'), `${JSON.stringify(summary, null, 2)}\n`)
    console.log(`[native-showcase] performance summary: ${summary.endpoints.length} endpoints`)
  } else {
    console.log('[native-showcase] no iOS smoke evidence (setup/build did not reach measurement)')
  }
}
