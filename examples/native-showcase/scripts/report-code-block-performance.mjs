import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// A completed capture is not a performance pass. Keep all raw-duration samples
// in the producer artifact, and derive the published table from that artifact.
const root = resolve(process.argv[2])
const evidence = JSON.parse(readFileSync(resolve(root, 'evidence.json'), 'utf8'))
assert.equal(evidence.passed, true, 'an incomplete run is not a completed matrix')
assert.equal(evidence.cases.length, 84)
const percentile = (values, fraction) => {
  assert.ok(values.length)
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.ceil(sorted.length * fraction) - 1]
}
const result = {
  source: evidence.source,
  binarySource: evidence.binarySource,
  apkSha256: evidence.apkSha256,
  refreshHz: evidence.refreshHz,
  budgetMs: 1000 / evidence.refreshHz,
  host: evidence.host,
  runtime: evidence.runtime,
  groups: [],
}
for (const count of [10, 100, 300, 1000]) {
  for (const phase of ['mount', 'update', 'scroll']) {
    const cases = evidence.cases.filter(
      (sample) => sample.name.startsWith(`${count}-`) && sample.name.includes(`-${phase}`),
    )
    if (!cases.length) {
      assert.equal(count, 10)
      assert.equal(phase, 'scroll')
      continue
    }
    assert.ok(cases.every((sample) => sample.passed))
    assert.equal(cases.length, phase === 'mount' ? 3 : phase === 'update' ? 9 : 12)
    const frames = cases.flatMap((sample) =>
      sample.frames.rows
        .filter((row) => !row.pending && row.flags === 0)
        .map((row) => row.durationMs),
    )
    const latency = cases.flatMap((sample) => (sample.js ? [sample.js.elapsedMs] : []))
    const aggregates = cases.map((sample) => sample.frames.aggregate)
    assert.ok(aggregates.every(Boolean))
    const group = {
      count,
      phase,
      windows: cases.length,
      frames: frames.length,
      uiP50Ms: percentile(frames, 0.5),
      uiP95Ms: percentile(frames, 0.95),
      uiMaxMs: Math.max(...frames),
      overBudget: frames.filter((duration) => duration > result.budgetMs).length,
      androidJanky: aggregates.reduce((sum, value) => sum + value.janky, 0),
      androidTotal: aggregates.reduce((sum, value) => sum + value.total, 0),
      flagged: cases.reduce((sum, sample) => sum + sample.frames.flaggedFrames, 0),
      pending: cases.reduce((sum, sample) => sum + sample.frames.pendingFrames, 0),
      truncatedWindows: cases.filter((sample) => sample.frames.recentWindowOnly).length,
    }
    if (latency.length)
      Object.assign(group, {
        latencyMedianMs: percentile(latency, 0.5),
        latencyMinMs: Math.min(...latency),
        latencyMaxMs: Math.max(...latency),
      })
    const gaps =
      phase === 'scroll'
        ? [1, 2, 3].flatMap(
            (round) =>
              JSON.parse(readFileSync(resolve(root, `${count}-${round}-scroll-js.json`), 'utf8'))
                .rafGapsMs,
          )
        : cases.flatMap((sample) => sample.js.rafGapsMs)
    if (gaps.length)
      Object.assign(group, {
        jsRafSamples: gaps.length,
        jsRafP95Ms: percentile(gaps, 0.95),
        jsRafMaxMs: Math.max(...gaps),
      })
    result.groups.push(group)
  }
}
writeFileSync(resolve(root, 'summary.json'), `${JSON.stringify(result, null, 2)}\n`)
console.log(JSON.stringify(result, null, 2))
