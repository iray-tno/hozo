// Manual spread-composition ablation; RN flattening/rendering is not timed.
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
assert.ok(baseline, 'pass --baseline=<git-ref> before Native author normalization')
const sources = {
  baseline: execFileSync('git', ['show', `${baseline}:packages/engine/src/spread-styles.ts`], {
    cwd: root,
    encoding: 'utf8',
  }),
  current: readFileSync(new URL('../src/spread-styles.ts', import.meta.url), 'utf8'),
  gapAware: readFileSync(new URL('../src/gap-styles.ts', import.meta.url), 'utf8'),
}
const size = {}
const compose = Object.fromEntries(
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
    runInNewContext(code, { module, exports: module.exports })
    return [name, module.exports[name === 'gapAware' ? 'hozoGapSpreadStyles' : 'hozoSpreadStyles']]
  }),
)
const flat = (value) => Object.assign({}, ...[value].flat(Infinity).filter(Boolean))
const compiled = { style: { paddingTop: 4 } }
const calls = 100_000
const rows = []
let checksum = 0
for (const [id, input] of [
  ['no-gap-object', { opacity: 0.5 }],
  ['no-gap-array', [{ opacity: 0.5 }, [null, { paddingLeft: 8 }]]],
]) {
  const source = { style: input }
  for (const run of Object.values(compose))
    assert.equal(
      JSON.stringify(flat(compose.baseline(compiled, [], source).style)),
      JSON.stringify(flat(run(compiled, [], source).style)),
    )
  const samples = { baseline: [], current: [], gapAware: [] }
  for (const run of Object.values(compose))
    for (let i = 0; i < 5000; i++) checksum += run(compiled, [], source).style.length
  for (let round = 0; round < 9; round++) {
    for (const name of round % 2
      ? ['gapAware', 'current', 'baseline']
      : ['baseline', 'current', 'gapAware']) {
      const start = performance.now()
      for (let i = 0; i < calls; i++) checksum += compose[name](compiled, [], source).style.length
      samples[name].push(performance.now() - start)
    }
  }
  rows.push({
    id,
    samplesMs: samples,
    mediansUs: Object.fromEntries(
      Object.entries(samples).map(([name, values]) => [
        name,
        (values.toSorted((a, b) => a - b)[4] * 1000) / calls,
      ]),
    ),
  })
}
console.log(
  JSON.stringify(
    {
      baseline,
      calls,
      samplePairs: 9,
      scope:
        'isolated spread composition on unchanged no-gap inputs; final StyleProp values compared after flattening outside the timer; no RN/device/app/memory or speedup claim',
      size,
      rows,
      checksum,
    },
    null,
    2,
  ),
)
