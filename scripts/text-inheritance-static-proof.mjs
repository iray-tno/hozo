// Separate B/C artifact: do not relabel the baseline schema or silently
// compare old drivers. This opt-in experiment never selects production code.
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { captureClosedTextProof } from '../packages/tailwind-conformance/src/text-inheritance-closed-workload.ts'
import { captureStaticPaintProof } from '../packages/tailwind-conformance/src/text-inheritance-static-workload.ts'

let rows = 8
let output
let kind = 'paint'
for (let index = 2; index < process.argv.length; index += 2) {
  const [key, value] = [process.argv[index], process.argv[index + 1]]
  assert.ok(value, `missing value for ${key}`)
  if (key === '--rows') rows = Number(value)
  else if (key === '--output') output = path.resolve(value)
  else if (key === '--kind') kind = value
  else throw new Error(`unknown option ${key}`)
}
assert.ok(Number.isInteger(rows) && rows > 0 && rows <= 1000, 'rows must be 1..1000')
assert.ok(['paint', 'closed-leaf'].includes(kind), 'kind must be paint or closed-leaf')
const warnings = []
const originalWarn = console.warn
const originalError = console.error
console.warn = (...args) => warnings.push(args.map(String).join(' '))
console.error = (...args) => {
  const message = args.map(String).join(' ')
  if (!message.startsWith('react-test-renderer is deprecated.')) throw new Error(message)
  warnings.push(message)
}
let report
try {
  report = {
    ...(kind === 'closed-leaf' ? captureClosedTextProof(rows) : captureStaticPaintProof(rows)),
    warnings,
  }
} finally {
  console.warn = originalWarn
  console.error = originalError
}
const json = `${JSON.stringify(report, null, 2)}\n`
if (output) {
  mkdirSync(path.dirname(output), { recursive: true })
  writeFileSync(output, json)
} else process.stdout.write(json)
console.error(JSON.stringify({ validated: report.validated, rows, timingAssessed: false }))
