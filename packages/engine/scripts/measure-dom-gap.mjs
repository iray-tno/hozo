// Manual same-process ablation of unchanged DOM-style inputs, not app/device cost.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { gzipSync } from 'node:zlib'
import { buildSync } from 'esbuild'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const baseline = process.argv.find((arg) => arg.startsWith('--baseline='))?.slice(11)
assert.ok(baseline, 'pass --baseline=<git-ref> before authored gap projection')
const sources = {
  baseline: execFileSync('git', ['show', `${baseline}:packages/engine/src/dom-style.ts`], {
    cwd: root,
    encoding: 'utf8',
  }),
  current: readFileSync(new URL('../src/dom-style.ts', import.meta.url), 'utf8'),
}
const size = {}
const implementations = Object.fromEntries(
  Object.entries(sources).map(([name, contents]) => {
    const code = buildSync({
      stdin: {
        contents,
        loader: 'ts',
        resolveDir: fileURLToPath(new URL('../src', import.meta.url)),
      },
      bundle: true,
      format: 'cjs',
      platform: 'node',
      minify: true,
      write: false,
    }).outputFiles[0].text
    size[name] = { minifiedBytes: Buffer.byteLength(code), gzipBytes: gzipSync(code).length }
    const module = { exports: {} }
    runInNewContext(code, { module, exports: module.exports, console })
    return [name, module.exports.hozoDomStyle]
  }),
)
const calls = 100_000
let checksum = 0
const rows = []
for (const [id, input] of [
  ['no-gap-object', { opacity: 0.5, padding: 8 }],
  ['no-gap-array', [{ opacity: 0.5 }, [null, false, { padding: 8 }]]],
  ['css-only-gap', { opacity: 0.5, gap: '8px 16px' }],
]) {
  assert.equal(
    JSON.stringify(implementations.baseline(input)),
    JSON.stringify(implementations.current(input)),
  )
  const samples = { baseline: [], current: [] }
  for (const normalize of Object.values(implementations))
    for (let i = 0; i < 5000; i++) checksum += normalize(input).opacity
  for (let round = 0; round < 9; round++) {
    for (const name of round % 2 ? ['current', 'baseline'] : ['baseline', 'current']) {
      const start = performance.now()
      for (let i = 0; i < calls; i++) checksum += implementations[name](input).opacity
      samples[name].push(performance.now() - start)
    }
  }
  const mediansUs = Object.fromEntries(
    Object.entries(samples).map(([name, values]) => [
      name,
      (values.toSorted((a, b) => a - b)[4] * 1000) / calls,
    ]),
  )
  rows.push({ id, samplesMs: samples, mediansUs })
}
console.log(
  JSON.stringify(
    {
      baseline,
      calls,
      samplePairs: 9,
      scope:
        'isolated bundled DOM normalizer; unchanged fixtures only; no app, Native renderer, memory or speedup claim',
      size,
      rows,
      checksum,
    },
    null,
    2,
  ),
)
