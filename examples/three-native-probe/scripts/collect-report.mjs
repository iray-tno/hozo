import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function collectReport(logText, apkBytes, touchAttempts = 1) {
  const events = []
  for (const line of logText.split(/\r?\n/)) {
    const marker = line.indexOf('[hozo-three-native] ')
    if (marker === -1) continue
    events.push(JSON.parse(line.slice(marker + '[hozo-three-native] '.length)))
  }

  for (const required of [
    'renderer_ready',
    'first_frame',
    'app_backgrounded',
    'app_resumed',
    'frame_after_resume',
    'steady_sample',
    'renderer_unmounted',
  ]) {
    if (!events.some((entry) => entry.event === required)) {
      throw new Error(`Native GPU probe did not emit ${required}`)
    }
  }

  const indexOf = (name) => events.findIndex((entry) => entry.event === name)
  const backgroundedAt = indexOf('app_backgrounded')
  const resumedAt = indexOf('app_resumed')
  const resumedFrameAt = indexOf('frame_after_resume')
  if (!(backgroundedAt < resumedAt && resumedAt < resumedFrameAt)) {
    throw new Error('Native GPU probe did not render after an ordered background/resume cycle')
  }

  const sampled = events.find(
    (entry, index) => index > resumedFrameAt && entry.event === 'steady_sample',
  )
  const canvasActivation = events.find(
    (entry, index) =>
      index > resumedFrameAt && entry.event === 'object_activated' && entry.source === 'canvas',
  )
  const semanticActivation = events.find(
    (entry, index) =>
      index > resumedFrameAt &&
      entry.event === 'object_activated' &&
      entry.source === 'semantic-control',
  )
  const initialRenderer = events.find((entry) => entry.event === 'renderer_ready')
  const resumed = events[resumedAt]
  const resumedFrame = events[resumedFrameAt]
  if (!sampled) {
    throw new Error('Native GPU probe did not sample frames after returning active')
  }
  if (!canvasActivation) {
    throw new Error('Native GPU probe did not raycast the measured object from a device touch')
  }
  if (!semanticActivation) {
    throw new Error(
      'Native GPU probe did not activate the measured object through its semantic control',
    )
  }
  if (
    sampled.objectId !== resumedFrame.objectId ||
    sampled.objectId !== canvasActivation.objectId ||
    sampled.objectId !== semanticActivation.objectId
  ) {
    throw new Error('The R3F touch target and its semantic control did not share object identity')
  }
  if (!Number.isInteger(touchAttempts) || touchAttempts < 1) {
    throw new Error('Native GPU probe reported an invalid touch attempt count')
  }

  return {
    schemaVersion: 2,
    host: 'expo-gl',
    apkBytes,
    lifecycle: {
      contextBeforeBackground: initialRenderer.contextId,
      contextAfterResume: resumedFrame.contextId,
      contextPreserved: initialRenderer.contextId === resumedFrame.contextId,
      resumeToFrameMs: resumedFrame.elapsedMs - resumed.elapsedMs,
      touchAttempts,
    },
    events,
  }
}

const isEntry = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isEntry) {
  const [, , logPath, apkPath, touchAttemptsPath, outputPath] = process.argv
  if (!logPath || !apkPath || !touchAttemptsPath || !outputPath) {
    throw new Error(
      'Usage: collect-report.mjs <logcat.txt> <app.apk> <touch-attempts.txt> <report.json>',
    )
  }
  const touchAttempts = Number.parseInt(readFileSync(touchAttemptsPath, 'utf8').trim(), 10)
  const report = collectReport(readFileSync(logPath, 'utf8'), statSync(apkPath).size, touchAttempts)
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
}
