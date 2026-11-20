import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseNodes } from './device-evidence.mjs'
import {
  tableSummary,
  verifyTablePixels,
  verifyTableSample,
  verifyTableWindow,
} from './table-performance-evidence.mjs'

// Recheck retained frames without reinstalling an app or repeating any input.
// This supplements the original measurement; it never supplies new timings.
const directory = resolve(process.argv[2] ?? 'artifacts/native-showcase-table')
const hash = (buffer) => createHash('sha256').update(buffer).digest('hex')
const report = { passed: false, kind: 'retained frame verification; no new measurement', cases: [] }
try {
  const raw = readFileSync(resolve(directory, 'evidence.json'))
  const evidence = JSON.parse(raw)
  report.measurementSource = evidence.source
  report.binarySource = evidence.binarySource
  report.binaryRun = evidence.binaryRun
  report.evidenceSha256 = hash(raw)
  report.verifierHashes = Object.fromEntries(
    ['verify-table-captures.mjs', 'table-performance-evidence.mjs', 'device-evidence.mjs'].map(
      (name) => [name, hash(readFileSync(fileURLToPath(new URL(name, import.meta.url))))],
    ),
  )
  assert.equal(evidence.passed, true, 'the original measurement must pass independently')
  assert.match(evidence.sourceHash, /^[a-f0-9]{64}$/)
  tableSummary(evidence.cases)
  for (const sample of evidence.cases) {
    assert.match(sample.name, /^(?:warmup|round-[123])-(?:normal|windowed)-(?:100|500|1000)$/)
    const entry = { name: sample.name, passed: false }
    report.cases.push(entry)
    verifyTableSample(sample, {
      mode: sample.mode,
      count: sample.count,
      sourceHash: evidence.sourceHash,
      windowedSourceHash: evidence.windowedSourceHash,
      windowedModelHash: evidence.windowedModelHash,
    })
    const png = readFileSync(resolve(directory, `${sample.name}.png`))
    const xml = readFileSync(resolve(directory, `${sample.name}-uiautomator.xml`))
    entry.screenshotSha256 = hash(png)
    entry.treeSha256 = hash(xml)
    entry.pixels = verifyTablePixels(png, parseNodes(xml.toString()))
    entry.passed = true
  }
  if (evidence.windows) {
    assert.deepEqual(
      evidence.windows.map((sample) => sample.phase),
      [
        'initial-window',
        'last-window',
        'returned-window',
        'horizontal-window',
        'font-scale-window',
      ],
    )
    for (const sample of evidence.windows) {
      assert.equal(sample.passed, true)
      verifyTableWindow(sample.observation, {
        count: 1000,
        windowedSourceHash: evidence.windowedSourceHash,
        windowedModelHash: evidence.windowedModelHash,
        includes: [sample.index + 1],
        excludes: sample.excludes,
      })
      const png = readFileSync(resolve(directory, `${sample.phase}.png`))
      const xml = readFileSync(resolve(directory, `${sample.phase}.xml`), 'utf8')
      report.cases.push({
        name: sample.phase,
        passed: true,
        pngSha256: hash(png),
        xmlSha256: hash(xml),
        pixels: verifyTablePixels(png, parseNodes(xml), {
          index: sample.index,
          columns: sample.columns,
          headers: false,
        }),
      })
    }
  }
  report.passed = true
  console.log(
    `${report.cases.length} retained Table captures: all headers and first-row values have text pixels and nonempty nodes`,
  )
} finally {
  writeFileSync(
    resolve(directory, 'pixel-verification.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  )
}
