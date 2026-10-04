import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { setTimeout as pause } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

// Read-only profiler, exact PID from simctl launch (not every same-named app).
// Sampling perturbs scheduling: its timings must not certify performance.
export function collectIosRenderSample(pid, output, run = execFileSync) {
  assert.match(String(pid), /^[1-9]\d*$/)
  mkdirSync(output, { recursive: true })
  const observation = { pid: Number(pid), startedAt: new Date().toISOString(), completed: false }
  try {
    writeFileSync(
      resolve(output, 'process.txt'),
      run('ps', ['-p', String(pid), '-o', 'pid,ppid,%cpu,state,etime,comm'], { timeout: 8_000 }),
    )
    run('/usr/bin/sample', [String(pid), '3', '1', '-file', resolve(output, 'sample.txt')], {
      timeout: 8_000,
    })
    observation.completed = true
  } catch (error) {
    observation.error = String(error)
  } finally {
    observation.finishedAt = new Date().toISOString()
    writeFileSync(resolve(output, 'sampling.json'), `${JSON.stringify(observation, null, 2)}\n`)
  }
  return observation
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [pid, output] = process.argv.slice(2)
  await pause(5_000)
  collectIosRenderSample(pid, resolve(output))
}
