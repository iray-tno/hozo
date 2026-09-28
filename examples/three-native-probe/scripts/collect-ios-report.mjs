import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

function directoryBytes(path) {
  return readdirSync(path, { withFileTypes: true }).reduce((total, entry) => {
    const child = join(path, entry.name)
    return total + (entry.isDirectory() ? directoryBytes(child) : statSync(child).size)
  }, 0)
}

export function collectIosReport(events, appBytes) {
  for (const required of [
    'renderer_ready',
    'first_frame',
    'app_backgrounded',
    'app_resumed',
    'frame_after_resume',
    'steady_sample',
    'renderer_unmounted',
  ]) {
    if (!events.some(({ event }) => event === required)) {
      throw new Error(`Native GPU iOS probe did not emit ${required}`)
    }
  }

  const indexOf = (name) => events.findIndex(({ event }) => event === name)
  const backgroundedAt = indexOf('app_backgrounded')
  const resumedAt = indexOf('app_resumed')
  const resumedFrameAt = indexOf('frame_after_resume')
  const sampledAt = indexOf('steady_sample')
  const unmountedAt = indexOf('renderer_unmounted')
  if (
    !(backgroundedAt < resumedAt && resumedAt < resumedFrameAt && resumedFrameAt < sampledAt) ||
    !(sampledAt < unmountedAt)
  ) {
    throw new Error('Native GPU iOS events did not follow the required lifecycle order')
  }

  const ready = events[indexOf('renderer_ready')]
  const resumed = events[resumedAt]
  const resumedFrame = events[resumedFrameAt]
  const sampled = events[sampledAt]
  if (sampled.frameCount !== 120 || sampled.objectId !== resumedFrame.objectId) {
    throw new Error('Native GPU iOS sample did not retain the resumed Three object')
  }

  return {
    schemaVersion: 1,
    host: 'expo-gl',
    platform: 'ios-simulator',
    appBytes,
    lifecycle: {
      contextBeforeBackground: ready.contextId,
      contextAfterResume: resumedFrame.contextId,
      contextPreserved: ready.contextId === resumedFrame.contextId,
      resumeToFrameMs: resumedFrame.elapsedMs - resumed.elapsedMs,
    },
    interaction: {
      pointerRaycast: 'not-run',
      voiceOver: 'not-run',
      reason: 'The iOS Simulator CLI does not expose trusted touch or VoiceOver traversal.',
    },
    events,
  }
}

const isEntry = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isEntry) {
  const [, , eventsPath, appPath, outputPath] = process.argv
  if (!eventsPath || !appPath || !outputPath) {
    throw new Error('Usage: collect-ios-report.mjs <events.json> <app> <report.json>')
  }
  const report = collectIosReport(
    JSON.parse(readFileSync(eventsPath, 'utf8')),
    directoryBytes(appPath),
  )
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
}
