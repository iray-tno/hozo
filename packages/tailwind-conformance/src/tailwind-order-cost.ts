// Opt-in cost ledger. No clock threshold or production compiler behavior here.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { build, version as esbuildVersion, transformSync } from 'esbuild'
import { createCompiler, openCandidateCache } from '../../compiler/src/index.ts'
import { orderCandidateFactory, orderSource } from './tailwind-order-baseline.ts'
import { ORDER_BASELINE, orderCases } from './tailwind-order-corpus.ts'
import { orderHash, prepareOrderReference } from './tailwind-order-reference.ts'

export const orderRepoRoot = fileURLToPath(new URL('../../../', import.meta.url))
const resolverPath = fileURLToPath(new URL('../../engine/src/class-resolver.ts', import.meta.url))

export function orderProvenance() {
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: orderRepoRoot, encoding: 'utf8' }).trim()
  const files = git(
    'ls-files',
    'crates',
    'packages/compiler/src',
    'packages/engine/src/class-resolver.ts',
    'Cargo.lock',
    'Cargo.toml',
  )
    .split('\n')
    .filter(Boolean)
  return {
    revision: git('rev-parse', 'HEAD'),
    dirty: !!git('status', '--porcelain', '--untracked-files=no'),
    productionSourceSha256: orderHash(
      files
        .map(
          (file) =>
            `${file}\0${readFileSync(new URL(`../../../${file}`, import.meta.url), 'utf8')}`,
        )
        .join('\0'),
    ),
    addonSha256: createHash('sha256')
      .update(readFileSync(new URL('../../compiler/hozo_napi.node', import.meta.url)))
      .digest('hex'),
    sourceBaseline: ORDER_BASELINE,
  }
}

export function summarizeOrderSamples(samples: number[], operations: number) {
  assert.ok(samples.length && operations > 0 && samples.every((n) => Number.isFinite(n) && n >= 0))
  const sorted = [...samples].sort((a, b) => a - b)
  return {
    operations,
    medianMs: sorted[Math.floor(sorted.length / 2)],
    p90Ms: sorted[Math.ceil(sorted.length * 0.9) - 1],
    samplesMs: samples,
  }
}

function bytes(code: string) {
  return { minified: Buffer.byteLength(code), gzip: gzipSync(code).byteLength }
}

export async function captureOrderCosts({
  samples = 7,
  iterations = 25,
  sizes = [16, 128, 1024],
  profile = 'debug',
  rebuilt = false,
} = {}) {
  assert.ok(Number.isInteger(samples) && samples >= 2 && samples <= 25, 'samples must be 2..25')
  assert.ok(
    Number.isInteger(iterations) && iterations > 0 && iterations <= 1000,
    'iterations must be 1..1000',
  )
  assert.ok(sizes.length && sizes.every((n) => Number.isInteger(n) && n >= 2 && n <= 4096))
  let sink = 0
  function measure(factory: () => (index: number) => number, operations: number) {
    const times = []
    for (let sample = 0; sample < samples; sample++) {
      const run = factory(),
        start = performance.now()
      for (let index = 0; index < operations; index++) sink += run(index)
      times.push(performance.now() - start)
    }
    return summarizeOrderSamples(times, operations)
  }
  const prepareTimes = []
  const firstReferenceStart = performance.now()
  await prepareOrderReference()
  const firstReferencePreparationMs = performance.now() - firstReferenceStart
  let reference: Awaited<ReturnType<typeof prepareOrderReference>>
  for (let index = 0; index < samples; index++) {
    const start = performance.now()
    reference = await prepareOrderReference()
    prepareTimes.push(performance.now() - start)
  }
  const start = performance.now(),
    compiler = createCompiler()
  const firstCompilerConstructionMs = performance.now() - start
  const sources = orderCases.flatMap((entry) =>
    [entry.classes, entry.classes.split(' ').reverse().join(' ')].map(
      (classes) => orderSource(entry, classes).source,
    ),
  )
  // Warm the compilation paths before repeated throughput samples. The first
  // constructor measurement above is explicitly not another warm sample.
  for (const source of sources) {
    compiler.compile(source)
    compiler.compileNative(source)
  }
  const compilation = {
    web: measure(
      () => (index) => compiler.compile(sources[index % sources.length]).length,
      iterations * sources.length,
    ),
    native: measure(
      () => (index) => compiler.compileNative(sources[index % sources.length]).length,
      iterations * sources.length,
    ),
  }
  const resolverSource = readFileSync(resolverPath, 'utf8')
  const resolverBytes = bytes(
    transformSync(resolverSource, { loader: 'ts', format: 'esm', target: 'es2022', minify: true })
      .code,
  )
  const tables = []
  for (const size of sizes) {
    const names = [
      ...Array.from({ length: size }, (_, index) => `p-${index + 1}`),
      'hover:p-2',
      'active:p-1',
    ]
    const cache = openCandidateCache()
    cache.scanFile('Cost.ts', JSON.stringify(names.join(' ')), 1)
    const generation = measure(() => () => cache.renderNativeModule().length, 1)
    const module = cache.renderNativeModule()
    // Transpile once; evaluating a fresh map/resolver is outside lookup clocks.
    const factory = orderCandidateFactory(module)
    const hotOperations = Math.max(100_000, iterations * 10_000)
    const count = Math.min(iterations * 200, size * size)
    const strings = Array.from(
      { length: count },
      (_, i) => `p-${(i % size) + 1} p-${Math.floor(i / size) + 1}`,
    )
    assert.equal(
      new Set(strings).size,
      count,
      'cold lookups must not accidentally hit a cached string',
    )
    const cold = measure(() => {
      const resolve = factory()
      return (index) => resolve(strings[index]).length
    }, count)
    const cached = measure(() => {
      const resolve = factory()
      resolve(strings[0])
      return () => resolve(strings[0]).length
    }, hotOperations)
    const states = measure(() => {
      const resolve = factory(),
        value = 'p-1 hover:p-2 active:p-1'
      resolve(value, { hovered: false, pressed: false })
      return (index) => resolve(value, { hovered: !!(index & 1), pressed: !!(index & 2) }).length
    }, hotOperations)
    const result = await build({
      stdin: { contents: "export { hozoClasses } from 'order:table'", resolveDir: orderRepoRoot },
      write: false,
      bundle: true,
      format: 'esm',
      platform: 'neutral',
      target: 'es2022',
      minify: true,
      plugins: [
        {
          name: 'order-fixture',
          setup(builder) {
            builder.onResolve({ filter: /^order:table$/ }, () => ({
              path: 'table',
              namespace: 'order',
            }))
            builder.onLoad({ filter: /.*/, namespace: 'order' }, () => ({
              contents: module,
              resolveDir: orderRepoRoot,
            }))
            builder.onResolve({ filter: /^@hozo\/core\/generated\/class-resolver$/ }, () => ({
              path: resolverPath,
            }))
          },
        },
      ],
    })
    tables.push({
      candidateCount: names.length,
      baseCandidates: size,
      generation,
      cold,
      cached,
      states,
      moduleBytes: bytes(
        transformSync(module, { format: 'esm', minify: true, target: 'es2022' }).code,
      ),
      consumerBundleBytes: bytes(result.outputFiles[0].text),
    })
  }
  return {
    schema: 1,
    provenance: orderProvenance(),
    context: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      profile,
      rustc: execFileSync('rustc', ['--version'], { cwd: orderRepoRoot, encoding: 'utf8' }).trim(),
      rustflags: process.env.RUSTFLAGS ?? '',
      esbuild: esbuildVersion,
      harnessSha256: orderHash(
        [
          'tailwind-order-cost.ts',
          'tailwind-order-baseline.ts',
          'tailwind-order-reference.ts',
          'tailwind-order-corpus.ts',
        ]
          .map((name) => readFileSync(new URL(name, import.meta.url), 'utf8'))
          .join('\0'),
      ),
      sourceCount: sources.length,
      samples,
      iterations,
      sizes,
      corpusSha256: reference!.snapshot.corpusSha256,
      themeSha256: reference!.snapshot.themeSha256,
      tailwindVersion: reference!.snapshot.tailwindVersion,
    },
    rebuiltForCapture: rebuilt,
    scope:
      'Fresh design contexts in a warm Node process; aggregate compile calls; candidate lookup; synthetic candidate consumer bundles, not a production application.',
    unassessed: [
      'project discovery/incremental transform',
      'separate Rust parse/planning/lowering',
      'IR allocations/peak memory',
      'production app bundle',
      'device pixels/AT',
      'per-state rank-read instrumentation',
    ],
    firstCompilerConstructionMs,
    firstReferencePreparationMs,
    preparation: summarizeOrderSamples(prepareTimes, 1),
    compilation,
    resolverBytes,
    tables,
    checksum: sink,
  }
}

export function compareOrderCosts(
  before: Awaited<ReturnType<typeof captureOrderCosts>>,
  after: Awaited<ReturnType<typeof captureOrderCosts>>,
) {
  assert.deepEqual(
    before.context,
    after.context,
    'incompatible corpus/toolchain/profile/workload; capture comparable runs',
  )
  assert.equal(before.schema, after.schema, 'incompatible report schema')
  assert.ok(
    before.rebuiltForCapture && after.rebuiltForCapture,
    'comparison requires fresh build receipts from the CLI',
  )
  const delta = (a: number, b: number) => ({
    before: a,
    after: b,
    delta: b - a,
    percent: a === 0 ? null : (b / a - 1) * 100,
  })
  return {
    note: 'Descriptive samples, not a clock gate; source revisions may differ. Correctness changes are assessed separately.',
    preparation: delta(before.preparation.medianMs, after.preparation.medianMs),
    compileWeb: delta(before.compilation.web.medianMs, after.compilation.web.medianMs),
    compileNative: delta(before.compilation.native.medianMs, after.compilation.native.medianMs),
    tables: after.tables.map((entry, i) => ({
      candidates: entry.candidateCount,
      cold: delta(before.tables[i].cold.medianMs, entry.cold.medianMs),
      cached: delta(before.tables[i].cached.medianMs, entry.cached.medianMs),
      states: delta(before.tables[i].states.medianMs, entry.states.medianMs),
      consumerGzip: delta(
        before.tables[i].consumerBundleBytes.gzip,
        entry.consumerBundleBytes.gzip,
      ),
    })),
  }
}
