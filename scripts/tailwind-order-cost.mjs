// Opt-in and serial. Rebuild before loading/using the addon; never benchmark a
// stale binary and silently label it with the currently checked-out revision.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const options = { samples: 7, iterations: 25, profile: 'debug', rebuilt: true }
let output, baseline
for (let index = 2; index < process.argv.length; index += 2) {
  const [key, value] = [process.argv[index], process.argv[index + 1]]
  assert.ok(value, `missing value for ${key}`)
  if (key === '--output') output = path.resolve(value)
  else if (key === '--baseline') baseline = path.resolve(value)
  else if (key === '--samples') options.samples = Number(value)
  else if (key === '--iterations') options.iterations = Number(value)
  else if (key === '--profile') options.profile = value
  else throw new Error(`unknown option ${key}`)
}
assert.ok(['debug', 'release'].includes(options.profile), 'profile must be debug or release')
assert.ok(
  Number.isInteger(options.samples) && options.samples >= 2 && options.samples <= 25,
  'samples must be 2..25',
)
assert.ok(
  Number.isInteger(options.iterations) && options.iterations >= 1 && options.iterations <= 1000,
  'iterations must be 1..1000',
)
if (output && baseline) {
  const canonical = (file) => {
    const resolved = existsSync(file) ? realpathSync(file) : file
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved
  }
  assert.notEqual(canonical(output), canonical(baseline), 'output must not overwrite the baseline')
  if (existsSync(output) && existsSync(baseline)) {
    const a = statSync(output),
      b = statSync(baseline)
    assert.ok(a.dev !== b.dev || a.ino !== b.ino, 'output aliases the baseline file')
  }
}
const root = fileURLToPath(new URL('../', import.meta.url))
execFileSync(
  process.execPath,
  [
    'packages/compiler/scripts/build-native.mjs',
    ...(options.profile === 'release' ? ['--release'] : []),
  ],
  {
    cwd: root,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env, CARGO_BUILD_JOBS: '1' },
  },
)
const { captureOrderCosts, compareOrderCosts } = await import(
  '../packages/tailwind-conformance/src/tailwind-order-cost.ts'
)
const report = await captureOrderCosts(options)
if (baseline)
  report.comparison = compareOrderCosts(JSON.parse(readFileSync(baseline, 'utf8')), report)
const json = `${JSON.stringify(report, null, 2)}\n`
if (output) {
  mkdirSync(path.dirname(output), { recursive: true })
  writeFileSync(output, json)
} else process.stdout.write(json)
console.error(
  JSON.stringify({
    revision: report.provenance.revision,
    compilation: report.compilation,
    tables: report.tables.map(({ candidateCount, consumerBundleBytes }) => ({
      candidateCount,
      consumerBundleBytes,
    })),
  }),
)
