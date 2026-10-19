import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readAndroidScenario } from './svg-filter-evidence.mjs'

const driver = fileURLToPath(new URL('./android-smoke.mjs', import.meta.url))
const execute = (scenario, output) =>
  execFileSync(process.execPath, [driver, output], {
    stdio: 'inherit',
    env: { ...process.env, HOZO_ANDROID_SCENARIO: scenario },
  })

// The emulator action splits its script on newlines and runs each line in a
// fresh shell. Keep branching here so one failed driver aborts the sequence.
export function runAndroidScenarios(value, run = execute) {
  const scenario = readAndroidScenario(value)
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
  run('svg-filters', 'artifacts/native-showcase-svg')
  if (scenario === 'full') run('full', 'artifacts/native-showcase')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  runAndroidScenarios(process.env.HOZO_ANDROID_SCENARIO)
