import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function collectReport(logText, apkBytes) {
  const events = []
  for (const line of logText.split(/\r?\n/)) {
    const marker = line.indexOf('[hozo-three-native] ')
    if (marker === -1) continue
    events.push(JSON.parse(line.slice(marker + '[hozo-three-native] '.length)))
  }

  for (const required of ['renderer_ready', 'first_frame', 'steady_sample', 'renderer_unmounted']) {
    if (!events.some((entry) => entry.event === required)) {
      throw new Error(`Native GPU probe did not emit ${required}`)
    }
  }

  const sampled = events.find((entry) => entry.event === 'steady_sample')
  const semanticActivation = events.find(
    (entry) => entry.event === 'object_activated' && entry.source === 'semantic-control',
  )
  if (!semanticActivation) {
    throw new Error(
      'Native GPU probe did not activate the measured object through its semantic control',
    )
  }
  if (sampled.objectId !== semanticActivation.objectId) {
    throw new Error('The R3F mesh and its semantic control did not share object identity')
  }

  return {
    schemaVersion: 1,
    host: 'expo-gl',
    apkBytes,
    events,
  }
}

const isEntry = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isEntry) {
  const [, , logPath, apkPath, outputPath] = process.argv
  if (!logPath || !apkPath || !outputPath) {
    throw new Error('Usage: collect-report.mjs <logcat.txt> <app.apk> <report.json>')
  }
  const report = collectReport(readFileSync(logPath, 'utf8'), statSync(apkPath).size)
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
}
