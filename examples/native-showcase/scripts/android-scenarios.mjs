import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startAndroidHostEvidence } from './android-host-evidence.mjs'
import { readAndroidScenario } from './svg-filter-evidence.mjs'

const driver = fileURLToPath(new URL('./android-smoke.mjs', import.meta.url))
const execute = (scenario, output) =>
  new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        scenario.startsWith('code-block-')
          ? fileURLToPath(new URL('./code-block-performance.mjs', import.meta.url))
          : driver,
        output,
      ],
      {
        stdio: 'inherit',
        env: { ...process.env, HOZO_ANDROID_SCENARIO: scenario },
      },
    )
    child.once('error', reject)
    child.once('close', (code, signal) =>
      code === 0 ? resolve() : reject(new Error(`${scenario} exited with ${signal ?? code}`)),
    )
  })

// The emulator action splits its script on newlines and runs each line in a
// fresh shell. Keep branching here so one failed driver aborts the sequence.
export async function runAndroidScenarios(value, run = execute) {
  const scenario = readAndroidScenario(value)
  // The same collector and artifact; the windowed variant opens the
  // `maxHeight` story instead (#1289).
  if (scenario === 'code-block-performance' || scenario === 'code-block-windowed') {
    return run(scenario, 'artifacts/native-showcase-code-block')
  }
  if (scenario === 'text-inheritance') {
    return run(scenario, 'artifacts/native-showcase-text')
  }
  if (scenario === 'audio-output') {
    return run(scenario, 'artifacts/native-showcase-audio')
  }
  if (scenario === 'audio-settings') {
    return run(scenario, 'artifacts/native-showcase-audio-settings')
  }
  if (scenario === 'ui-docs') {
    return run(scenario, 'artifacts/native-showcase-ui-docs')
  }
  await run('svg-filters', 'artifacts/native-showcase-svg')
  if (scenario === 'full') {
    await run('full', 'artifacts/native-showcase')
    // The docs component previews, last: the weekly run is where the docs
    // site fetches them from (#1160), and they assert nothing the full
    // showcase depends on.
    await run('ui-docs', 'artifacts/native-showcase-ui-docs')
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const scenario = readAndroidScenario(process.env.HOZO_ANDROID_SCENARIO)
  let evidence
  if (process.platform === 'linux' && (scenario === 'full' || scenario === 'ui-docs')) {
    try {
      evidence = startAndroidHostEvidence('artifacts/native-showcase-android-host')
    } catch (error) {
      console.warn('Unable to start Android host evidence:', error.message)
    }
  }
  try {
    await runAndroidScenarios(scenario, async (mode, output) => {
      evidence?.sample('scenario-start', mode)
      try {
        await execute(mode, output)
        evidence?.sample('scenario-pass', mode)
      } catch (error) {
        evidence?.sample('scenario-fail', mode)
        throw error
      }
    })
  } finally {
    await evidence?.stop()
  }
}
