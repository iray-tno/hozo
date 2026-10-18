// Opt-in artifact capture. The deterministic assertions run in the existing
// conformance test task; no device or benchmark-clock gate is introduced.
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { captureTextBaseline } from '../packages/tailwind-conformance/src/text-inheritance-baseline.ts'
import { compareTextBaselines } from '../packages/tailwind-conformance/src/text-inheritance-comparison.ts'

let rows = 8
let output
let baseline
for (let index = 2; index < process.argv.length; index += 2) {
  const [key, value] = [process.argv[index], process.argv[index + 1]]
  assert.ok(value, `missing value for ${key}`)
  if (key === '--rows') rows = Number(value)
  else if (key === '--output') output = path.resolve(value)
  else if (key === '--baseline') baseline = path.resolve(value)
  else throw new Error(`unknown option ${key}`)
}
assert.ok(Number.isInteger(rows) && rows > 0 && rows <= 1000, 'rows must be 1..1000')
assert.ok(!output || output !== baseline, 'the output must not overwrite the baseline')
const report = captureTextBaseline(rows)
if (baseline)
  report.comparison = compareTextBaselines(JSON.parse(readFileSync(baseline, 'utf8')), report)
const json = `${JSON.stringify(report, null, 2)}\n`
if (output) {
  mkdirSync(path.dirname(output), { recursive: true })
  writeFileSync(output, json)
} else process.stdout.write(json)
console.error(JSON.stringify(report.summary))
if (!report.measurementValid) process.exitCode = 1
if (report.comparison?.changes.some((entry) => entry.change === 'regressed')) process.exitCode = 1
