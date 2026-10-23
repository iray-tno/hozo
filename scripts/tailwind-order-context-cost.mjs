// Opt-in preparation cost, not a PR clock threshold or device payload measure.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { gzipSync } from 'node:zlib'
import { prepareTailwindOrder, tailwindPackageDir } from '../packages/tailwind/src/theme.ts'

assert.equal(process.argv.length, 2, 'no options: write stdout to an evidence JSON file')
const base = tailwindPackageDir()
const css = readFileSync(path.join(base, 'theme.css'), 'utf8')
const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const sourceFiles = [
  'packages/tailwind/src/ordering.ts',
  'packages/tailwind/src/theme.ts',
  'packages/tailwind/src/static-css.ts',
  'scripts/tailwind-order-context-cost.mjs',
]
const start = performance.now()
await prepareTailwindOrder(css, base, ['p-1'])
const firstPreparationMs = performance.now() - start
const records = []
for (const count of [1, 16, 128, 1024]) {
  const candidates = Array.from({ length: count }, (_, i) => `p-${i + 1}`)
  const samplesMs = []
  let snapshot
  for (let sample = 0; sample < 7; sample++) {
    const start = performance.now()
    const prepared = await prepareTailwindOrder(css, base, candidates)
    samplesMs.push(performance.now() - start)
    assert.equal(prepared.snapshot.candidates.length, count)
    assert.ok(prepared.snapshot.candidates.every((entry) => entry.status === 'described'))
    snapshot = prepared.snapshot
  }
  const sorted = samplesMs.toSorted((a, b) => a - b)
  const json = JSON.stringify(snapshot)
  records.push({
    count,
    samplesMs,
    medianMs: sorted[3],
    p90Ms: sorted[6],
    fingerprint: snapshot.fingerprint,
    snapshotJsonBytes: Buffer.byteLength(json),
    snapshotGzipBytes: gzipSync(json).byteLength,
  })
}
console.log(
  JSON.stringify(
    {
      schema: 1,
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      tailwindVersion: JSON.parse(readFileSync(path.join(base, 'package.json'), 'utf8')).version,
      sourceSha256: sha256(
        sourceFiles
          .map((file) => `${file}\0${readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')}`)
          .join('\0'),
      ),
      themeSha256: sha256(css),
      firstPreparationMs,
      records,
      unassessed: [
        'cold Node startup (imports precede clocks)',
        'real project source discovery or JS/TS parsing',
        'incremental compiler planning or IR memory',
        'runtime overhead or application bundle bytes (snapshot is build-only)',
      ],
    },
    null,
    2,
  ),
)
