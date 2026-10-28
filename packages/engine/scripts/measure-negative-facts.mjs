// Manual positive-path ablation; no device/render or negative-feature speed claim.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { gzipSync } from 'node:zlib'
import { transformSync } from 'esbuild'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const baseline = process.argv
  .find((arg) => arg.startsWith('--baseline='))
  ?.slice('--baseline='.length)
assert.ok(baseline, 'pass --baseline=<git-ref> with the prior resolver implementation')
const sources = {
  baseline: execFileSync('git', ['show', `${baseline}:packages/engine/src/class-resolver.ts`], {
    cwd: root,
    encoding: 'utf8',
  }),
  current: readFileSync(new URL('../src/class-resolver.ts', import.meta.url), 'utf8'),
}
const implementations = Object.fromEntries(
  Object.entries(sources).map(([name, source]) => {
    const module = { exports: {} }
    runInNewContext(transformSync(source, { loader: 'ts', format: 'cjs' }).code, {
      module,
      exports: module.exports,
      console,
    })
    return [name, module.exports.createClassResolver]
  }),
)
const size = Object.fromEntries(
  Object.entries(sources).map(([name, source]) => {
    const code = transformSync(source, { loader: 'ts', format: 'esm', minify: true }).code
    return [name, { minifiedBytes: Buffer.byteLength(code), gzipBytes: gzipSync(code).length }]
  }),
)
const rows = []
let checksum = 0
const calls = 100_000
for (const stateClasses of [0, 16, 256]) {
  const styles = { base: { opacity: 1 } }
  const states = Object.fromEntries(
    Array.from({ length: stateClasses }, (_, i) => [
      `state${i}`,
      [[['aria-selected'], { opacity: 0.5 }]],
    ]),
  )
  const value = stateClasses ? 'base state0' : 'base'
  const resolvers = Object.fromEntries(
    Object.entries(implementations).map(([name, create]) => [
      name,
      create(styles, {}, undefined, states),
    ]),
  )
  for (const selected of [false, true])
    assert.equal(
      Object.assign({}, ...resolvers.current(value, { 'aria-selected': selected })).opacity,
      Object.assign({}, ...resolvers.baseline(value, { 'aria-selected': selected })).opacity,
    )
  const samples = { baseline: [], current: [] }
  for (const resolve of Object.values(resolvers))
    for (let i = 0; i < 5000; i++)
      checksum += resolve(value, { 'aria-selected': Boolean(i & 1) }).length
  for (let sample = 0; sample < 9; sample++)
    for (const name of sample % 2 ? ['current', 'baseline'] : ['baseline', 'current']) {
      const create = implementations[name]
      let start = performance.now()
      for (let i = 0; i < 100; i++) checksum += create(styles, {}, undefined, states)('base').length
      const factoriesMs = performance.now() - start
      const resolve = resolvers[name]
      start = performance.now()
      for (let i = 0; i < calls; i++)
        checksum += resolve(value, { 'aria-selected': Boolean(i & 1) }).length
      samples[name].push({ factoriesMs, stateUpdatesMs: performance.now() - start })
    }
  const median = (values) => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)]
  rows.push({
    stateClasses,
    samples,
    medians: Object.fromEntries(
      Object.entries(samples).map(([name, values]) => [
        name,
        {
          factoryUs: (median(values.map((v) => v.factoriesMs)) * 1000) / 100,
          cachedCallUs: (median(values.map((v) => v.stateUpdatesMs)) * 1000) / calls,
        },
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
        'isolated resolver, positive-only fixtures; factory and cached state updates separately; not whole app, device, memory or negative-feature equivalence',
      size,
      rows,
      checksum,
    },
    null,
    2,
  ),
)
