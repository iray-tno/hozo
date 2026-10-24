// Opt-in serial build-time evidence, never a CI clock threshold. The ordinary
// cost ledger remains the before/after control for the default entry points.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
execFileSync(process.execPath, ['packages/compiler/scripts/build-native.mjs'], {
  cwd: root,
  stdio: ['ignore', 'ignore', 'inherit'],
  env: { ...process.env, CARGO_BUILD_JOBS: '1' },
})
const { createCompiler, prepareTailwindContext } = await import('../packages/compiler/src/index.ts')
const { emitTailwindModules } = await import('../packages/compiler/src/tailwind-project.ts')
const { TailwindProjectSession } = await import('../packages/compiler/src/tailwind-session.ts')
const { loadTheme, prepareTailwindOrder, tailwindPackageDir } = await import(
  '../packages/tailwind/src/theme.ts'
)
const { orderProvenance, summarizeOrderSamples } = await import(
  '../packages/tailwind-conformance/src/tailwind-order-cost.ts'
)
const base = tailwindPackageDir()
const css = readFileSync(path.join(base, 'theme.css'), 'utf8')
const samples = 7,
  count = 16
const sources = Array.from(
  { length: count },
  (_, index) => `import {Pressable,Text,Avatar} from '@hozo/core';
  const padding='p-${index + 1}';export const Row=({ready,extra})=><Pressable className={padding}>
  <Avatar fallbackClassName="font-bold"/><Text className="text-lg hover:text-red-500">Row ${index}</Text></Pressable>`,
)
const theme = await loadTheme(css, base)
const compiler = createCompiler(theme)
const results = []
for (const platform of ['web', 'native']) {
  const ordinary = (source) =>
    platform === 'web' ? compiler.compile(source) : compiler.compileNativeModule(source)
  const collect = (owner, source) =>
    platform === 'web' ? owner.prepareWebModule(source) : owner.prepareNativeModule(source)
  const make = () => sources.map((source) => collect(compiler, source))
  const collectors = sources.map((source) => (owner) => collect(owner, source))
  const seed = make()
  const universe = [...new Set(seed.flatMap((module) => module.candidates))].sort()
  for (const name of ['p-1', 'p-16', 'font-bold', 'text-lg', 'hover:text-red-500'])
    assert.ok(universe.includes(name), `${platform} benchmark must retain ${name}`)
  for (const module of seed) module.dispose()
  const preparationStart = performance.now()
  const snapshot = (await prepareTailwindOrder(css, base, universe)).snapshot
  const serialized = JSON.stringify(snapshot)
  const firstPreparationMs = performance.now() - preparationStart
  compiler.setTailwindOrder(serialized)
  const expected = sources.map(ordinary)
  const stages = {
    synchronous: [],
    collect: [],
    context: [],
    emit: [],
    completeBatch: [],
    upstreamPreparation: [],
    sessionWarmBatch: [],
    sessionWarmFiles: [],
  }
  let sessionPreparations = 0
  const session = new TailwindProjectSession(compiler, async (names) => {
    sessionPreparations++
    return JSON.stringify((await prepareTailwindOrder(css, base, names)).snapshot)
  })
  const firstSessionStart = performance.now()
  assert.deepEqual(await session.emit(`batch:${platform}`, collectors, universe), expected)
  const firstSessionMs = performance.now() - firstSessionStart
  for (let sample = 0; sample < samples; sample++) {
    let start = performance.now()
    const control = sources.map(ordinary)
    stages.synchronous.push(performance.now() - start)
    assert.deepEqual(control, expected)
    start = performance.now()
    const retained = make()
    stages.collect.push(performance.now() - start)
    start = performance.now()
    const context = prepareTailwindContext(serialized)
    context.requireCandidates(universe)
    stages.context.push(performance.now() - start)
    start = performance.now()
    const emitted = retained.map((module) => module.emit(context))
    stages.emit.push(performance.now() - start)
    for (const module of retained) module.dispose()
    assert.deepEqual(emitted, expected)
    start = performance.now()
    const batch = await emitTailwindModules(make(), async (names) => {
      const before = performance.now()
      const json = JSON.stringify((await prepareTailwindOrder(css, base, names)).snapshot)
      stages.upstreamPreparation.push(performance.now() - before)
      return json
    })
    stages.completeBatch.push(performance.now() - start)
    assert.deepEqual(batch, expected)
    start = performance.now()
    const reused = await session.emit(`batch:${platform}`, collectors, universe)
    stages.sessionWarmBatch.push(performance.now() - start)
    assert.deepEqual(reused, expected)
    start = performance.now()
    const files = []
    for (let index = 0; index < sources.length; index++) {
      const [output] = await session.emit(
        `file:${platform}:${index}`,
        [(owner) => collect(owner, sources[index])],
        universe,
      )
      files.push(output)
    }
    stages.sessionWarmFiles.push(performance.now() - start)
    assert.deepEqual(files, expected)
  }
  assert.equal(sessionPreparations, 1, 'warm requests must not re-run preparation')
  session.invalidate()
  results.push({
    platform,
    modules: count,
    sourceBytes: sources.reduce((total, source) => total + Buffer.byteLength(source), 0),
    candidates: universe.length,
    firstPreparationMs,
    firstSessionMs,
    sessionPreparations,
    fingerprint: snapshot.fingerprint,
    stages: Object.fromEntries(
      Object.entries(stages).map(([stage, values]) => [
        stage,
        summarizeOrderSamples(values, count),
      ]),
    ),
    outputUnchanged: true,
  })
}
console.log(
  JSON.stringify(
    {
      schema: 2,
      profile: 'debug',
      node: process.version,
      rust: execFileSync('rustc', ['--version'], { encoding: 'utf8', cwd: root }).trim(),
      harnessSha256: createHash('sha256')
        .update(readFileSync(new URL(import.meta.url)))
        .digest('hex'),
      samples,
      themeColors: theme.colors.length,
      provenance: orderProvenance(),
      results,
      limitations: [
        'Same-process synthetic bounded 16-module batches; all samples retained. No startup, isolated parser/allocation or peak-memory measurement.',
        'Collect includes parsing/forwarding, retained handles, candidate marshalling and any font snapshot. Context includes one JSON decode/validation and completeness check per batch.',
        'Emit uses a prevalidated context without per-file decoding. Complete batch includes collection, asynchronous upstream preparation, serialization, context setup, emit and cleanup.',
        'Session first-use includes one preparation; warm batch and 16 sequential single-file calls reuse it with the full known universe. Key normalization, cancellation tickets and collection/emission remain in the clocks. This does not time invalidation or large-universe normalization.',
        'Default adapters are unchanged; no speedup, enabled cascade comparator, application bundle or Native pixels/AT claim.',
      ],
    },
    null,
    2,
  ),
)
