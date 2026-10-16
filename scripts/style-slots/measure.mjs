// Opt-in, browser-free before/after probe. Rebuild the addon at each revision
// and keep the same fixture/catalog version for both captures. Not a CI clock
// threshold: output equality is deterministic, runner timings are not.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { transformSync } from 'esbuild'
import { createCompiler, openCandidateCache } from '../../packages/compiler/dist/index.js'
import { components } from './catalog.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const started = performance.now()
const compiler = createCompiler()
const coldMs = performance.now() - started
const sources = []
const stableSources = []
for (const [component, slots] of Object.entries(components)) {
  for (const slot of slots) {
    const expressions = [
      '"p-2 hover:opacity-50 disabled:rounded-lg read-only:outline-2 aria-selected:text-red-500"',
      '{classes}',
    ]
    expressions.push('{cx("p-2", classes)}')
    for (const expression of expressions) {
      // Retain legacy inferred names even where no matching style prop exists:
      // this is a codegen/diagnostic comparison, not a typed render fixture.
      const style =
        slot.classProp === 'className' ? 'style' : slot.classProp.replace(/ClassName$/, 'Style')
      const source = `import { ${component}, cx } from '@hozo/core'; export function C({classes,extra,press}) {return <${component} onStepPress={press} ${slot.classProp}=${expression} ${style}={extra} />}`
      sources.push(source)
      // Exclude only the newly AOT-lowered secondary mixed cases. Comparing
      // this pool separately distinguishes old-path cost from doing more
      // compile-time work (and less on-device work) for new capabilities.
      if (slot.lowering !== 'secondary' || expression !== '{cx("p-2", classes)}') {
        stableSources.push(source)
      }
    }
  }
}
const modules = sources.map((source) => compiler.compileNativeModule(source))
const cache = openCandidateCache()
cache.scanFile('Fixture.tsx', sources.join('\n'), 1)
const native = {}
for (const name of [
  'chip',
  'color-picker',
  'pagination',
  'stepper',
  'command-palette',
  'otp-input',
]) {
  // Strip types before identifier minification so a type-only symbol cannot
  // perturb the minifier's short-name allocation and create a false mismatch.
  const js = transformSync(
    readFileSync(path.join(root, `packages/patterns/src/${name}.native.tsx`), 'utf8'),
    { loader: 'tsx', jsx: 'automatic', format: 'esm' },
  ).code
  const minified = transformSync(js, { loader: 'js', format: 'esm', minify: true }).code
  native[name] = { js, minified, bytes: Buffer.byteLength(minified) }
}
const output = { modules, candidates: cache.renderNativeModule(), native }
const summary = {
  modules: modules.length,
  hash: createHash('sha256').update(JSON.stringify(output)).digest('hex'),
  coldMs,
}
const baseline = process.argv
  .find((argument) => argument.startsWith('--baseline='))
  ?.slice('--baseline='.length)
if (baseline) {
  assert.deepEqual(output, JSON.parse(readFileSync(path.resolve(baseline), 'utf8')).output)
  summary.baselineIdentical = true
}
function benchmark(pool) {
  for (let i = 0; i < 500; i++) compiler.compileNativeModule(pool[i % pool.length])
  const samples = []
  for (let sample = 0; sample < 9; sample++) {
    const start = performance.now()
    for (let i = 0; i < 2000; i++) compiler.compileNativeModule(pool[i % pool.length])
    samples.push(performance.now() - start)
  }
  const sorted = [...samples].sort((left, right) => left - right)
  return {
    fixtureCount: pool.length,
    modulesPerSample: 2000,
    medianMs: sorted[4],
    p90Ms: sorted[8],
    samples,
  }
}
if (process.argv.includes('--benchmark')) {
  summary.warm = benchmark(sources)
  if (process.argv.includes('--stable')) summary.stableWarm = benchmark(stableSources)
}
console.error(JSON.stringify(summary))
console.log(JSON.stringify({ output, summary }))
