// Opt-in RFC 007 build-time cost receipt; never a timed PR acceptance gate.
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
// Load only after the rebuild; a Windows process holds an addon open.
const { createCompiler } = await import('../packages/compiler/src/index.ts')
const { prepareTailwindOrder, tailwindPackageDir } = await import(
  '../packages/tailwind/src/theme.ts'
)
const { orderProvenance, summarizeOrderSamples } = await import(
  '../packages/tailwind-conformance/src/tailwind-order-cost.ts'
)
const base = tailwindPackageDir()
const css = readFileSync(path.join(base, 'theme.css'), 'utf8')
const samples = 7,
  iterations = 20
function measure(run) {
  const values = []
  for (let sample = 0; sample < samples; sample++) {
    const start = performance.now()
    for (let i = 0; i < iterations; i++) run()
    values.push(performance.now() - start)
  }
  return summarizeOrderSamples(values, iterations)
}
const results = []
for (const count of [16, 128, 1024]) {
  const names = Array.from({ length: count }, (_, index) => `p-${index + 1}`)
  const prepared = await prepareTailwindOrder(css, base, names)
  const serialized = JSON.stringify(prepared.snapshot)
  const compiler = createCompiler()
  const source = `import {View} from '@hozo/core';const el=<View className="${names.slice(0, 16).join(' ')}"/>`
  const before = { web: compiler.compile(source), native: compiler.compileNativeModule(source) }
  const noContextInspection = measure(() => compiler.inspectTailwindOrder(source))
  const replaceContext = measure(() => compiler.setTailwindOrder(serialized))
  const binding = compiler.inspectTailwindOrder(source)
  assert.ok(binding.candidates.every((candidate) => candidate.status === 'described'))
  assert.equal(binding.candidates.length, Math.min(count, 16))
  assert.equal(binding.fingerprint, prepared.snapshot.fingerprint)
  const boundInspection = measure(() => compiler.inspectTailwindOrder(source))
  assert.deepEqual(compiler.compile(source), before.web)
  assert.deepEqual(compiler.compileNativeModule(source), before.native)
  results.push({
    count,
    snapshotBytes: Buffer.byteLength(serialized),
    fingerprint: prepared.snapshot.fingerprint,
    noContextInspection,
    replaceContext,
    boundInspection,
    outputUnchangedWithContext: true,
  })
}
process.stdout.write(
  `${JSON.stringify(
    {
      schema: 1,
      profile: 'debug',
      node: process.version,
      provenance: orderProvenance(),
      harnessSha256: createHash('sha256')
        .update(readFileSync(new URL(import.meta.url)))
        .digest('hex'),
      samples,
      iterations,
      results,
      limitations: [
        'Context replacement includes JSON decoding, validation, indexing and destruction of the previous context; input serialization/preparation excluded.',
        'Inspection includes the evidence-only parse plus binding/serialization, not isolated bind time or production lowering overhead.',
        'Same-process warmed samples on synthetic universes, not application bundles, peak memory, cold Node startup or Native pixels.',
      ],
    },
    null,
    2,
  )}\n`,
)
