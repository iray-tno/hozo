import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readAndroidScenario } from './svg-filter-evidence.mjs'

const driver = fileURLToPath(new URL('./android-smoke.mjs', import.meta.url))
const execute = (scenario, output) =>
  execFileSync(
    process.execPath,
    [
      scenario === 'code-block-performance'
        ? fileURLToPath(new URL('./code-block-performance.mjs', import.meta.url))
        : driver,
      output,
    ],
    {
      stdio: 'inherit',
      env: { ...process.env, HOZO_ANDROID_SCENARIO: scenario },
    },
  )

// The emulator action splits its script on newlines and runs each line in a
// fresh shell. Keep branching here so one failed driver aborts the sequence.
export function runAndroidScenarios(value, run = execute) {
  const scenario = readAndroidScenario(value)
  if (scenario === 'code-block-performance') {
    run(scenario, 'artifacts/native-showcase-code-block')
    return
  }
  if (scenario === 'text-inheritance') {
    run(scenario, 'artifacts/native-showcase-text')
    return
  }
  if (scenario === 'audio-output') {
    run(scenario, 'artifacts/native-showcase-audio')
    return
  }
  if (scenario === 'audio-settings') {
    run(scenario, 'artifacts/native-showcase-audio-settings')
    return
  }
  if (scenario === 'ui-docs') {
    run(scenario, 'artifacts/native-showcase-ui-docs')
    return
  }
  run('svg-filters', 'artifacts/native-showcase-svg')
  if (scenario === 'full') {
    run('full', 'artifacts/native-showcase')
    // The docs component previews, last: the weekly run is where the docs
    // site fetches them from (#1160), and they assert nothing the full
    // showcase depends on.
    run('ui-docs', 'artifacts/native-showcase-ui-docs')
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  runAndroidScenarios(process.env.HOZO_ANDROID_SCENARIO)
