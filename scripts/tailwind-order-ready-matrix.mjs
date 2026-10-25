// Opt-in CPU-1/serial evidence. No default adapter or CI timing threshold.
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
const { TailwindCandidateUniverse, TailwindProjectSession } = await import(
  '../packages/compiler/src/tailwind-session.ts'
)
const { loadTheme, prepareTailwindOrder, tailwindPackageDir } = await import(
  '../packages/tailwind/src/theme.ts'
)
const { orderProvenance, summarizeOrderSamples } = await import(
  '../packages/tailwind-conformance/src/tailwind-order-cost.ts'
)
const hash = (text) => createHash('sha256').update(text).digest('hex')
const base = tailwindPackageDir(),
  css = readFileSync(path.join(base, 'theme.css'), 'utf8')
const theme = await loadTheme(css, base),
  count = 16,
  samples = 12
const sources = Array.from(
  { length: count },
  (_, index) => `import {Pressable,Text,Avatar} from '@hozo/core';
const padding='p-${index + 1}';export const Row=()=> <Pressable className={padding}>
<Avatar fallbackClassName="font-bold"/><Text className="text-lg hover:text-red-500">Row ${index} 😀</Text></Pressable>`,
)
const seedCompiler = createCompiler(theme)
const retained = sources.map((source) => seedCompiler.prepareWebModule(source))
const actualNames = [...new Set(retained.flatMap((module) => module.candidates))].sort()
for (const module of retained) module.dispose()
const results = []
for (const size of [20, 256, 1026]) {
  const names = new Set(actualNames)
  for (let index = 1; names.size < size; index++) names.add(`p-${index}`)
  const candidates = [...names].sort()
  assert.equal(candidates.length, size)
  const setupStart = performance.now()
  const snapshot = (await prepareTailwindOrder(css, base, candidates)).snapshot
  const serialized = JSON.stringify(snapshot)
  const preparationMs = performance.now() - setupStart
  const construction = [],
    decode = []
  for (let sample = 0; sample < samples; sample++) {
    let start = performance.now()
    const revision = new TailwindCandidateUniverse(candidates)
    construction.push(performance.now() - start)
    assert.deepEqual(revision.candidates, candidates)
    start = performance.now()
    const context = prepareTailwindContext(serialized)
    context.requireCandidates(candidates)
    decode.push(performance.now() - start)
  }
  const universe = new TailwindCandidateUniverse(candidates)
  for (const platform of ['web', 'native']) {
    const compiler = createCompiler(theme)
    compiler.setTailwindOrder(serialized)
    const ordinary = (source) =>
      platform === 'web' ? compiler.compile(source) : compiler.compileNativeModule(source)
    const collect = (owner, source) =>
      platform === 'web' ? owner.prepareWebModule(source) : owner.prepareNativeModule(source)
    const method = platform === 'web' ? 'compileWebOrPrepare' : 'compileNativeOrPrepare'
    const readyAvailable = typeof compiler[method] === 'function'
    const expected = sources.map(ordinary)
    let preparations = 0
    const session = new TailwindProjectSession(compiler, async (names) => {
      preparations++
      return JSON.stringify((await prepareTailwindOrder(css, base, names)).snapshot)
    })
    const first = performance.now()
    assert.deepEqual(
      await session.emit(
        'prime',
        sources.map((source) => (owner) => collect(owner, source)),
        candidates,
      ),
      expected,
    )
    const firstSessionMs = performance.now() - first
    const stages = { synchronous: [], retainedFiles: [] }
    if (readyAvailable) {
      stages.readyRevision = []
      stages.readyIterable = []
    }
    const stageOrder = []
    const attempt = (owner, context, source) => {
      const value = context ? owner[method](source, context) : collect(owner, source)
      const complete = platform === 'web' ? Array.isArray(value) : 'components' in value
      return complete ? { kind: 'complete', output: value } : { kind: 'prepared', module: value }
    }
    for (let sample = 0; sample < samples; sample++) {
      const keys = Object.keys(stages),
        offset = sample % keys.length
      const order = [...keys.slice(offset), ...keys.slice(0, offset)]
      stageOrder.push(order)
      for (const stage of order) {
        const start = performance.now()
        let output
        if (stage === 'synchronous') output = sources.map(ordinary)
        else {
          output = []
          for (let index = 0; index < sources.length; index++) {
            if (stage === 'retainedFiles') {
              const [value] = await session.emit(
                `file:${index}`,
                [(owner) => collect(owner, sources[index])],
                candidates,
              )
              output.push(value)
            } else
              output.push(
                await session.runModule(
                  `file:${index}`,
                  stage === 'readyRevision' ? universe : candidates,
                  (owner, context) => attempt(owner, context, sources[index]),
                ),
              )
          }
        }
        stages[stage].push(performance.now() - start)
        assert.deepEqual(output, expected)
      }
    }
    assert.equal(preparations, 1)
    session.invalidate()
    results.push({
      platform,
      candidates: size,
      candidateSha256: hash(JSON.stringify(candidates)),
      readyAvailable,
      preparationMs,
      firstSessionMs,
      preparations,
      serializedBytes: Buffer.byteLength(serialized),
      universeConstruction: summarizeOrderSamples(construction, 1),
      contextDecodeAndRequire: summarizeOrderSamples(decode, 1),
      stageOrder,
      stages: Object.fromEntries(
        Object.entries(stages).map(([name, values]) => [
          name,
          summarizeOrderSamples(values, count),
        ]),
      ),
      outputSha256: hash(JSON.stringify(expected)),
      outputUnchanged: true,
    })
  }
}
console.log(
  JSON.stringify(
    {
      schema: 1,
      profile: 'debug',
      node: process.version,
      rust: execFileSync('rustc', ['--version'], { cwd: root, encoding: 'utf8' }).trim(),
      harnessSha256: hash(readFileSync(new URL(import.meta.url))),
      fixtureSha256: hash(JSON.stringify(sources)),
      modules: count,
      samples,
      themeColors: theme.colors.length,
      provenance: orderProvenance(),
      results,
      limitations: [
        'Synthetic module compiler entry points, not full Web lowerModule, full Metro, a running adapter or an application. Large universe is real padding utilities plus the retained source names, not a broad utility conformance corpus.',
        'All samples retained; order rotates with balanced positions. Universe construction and context decode/completeness are timed separately; theme/compiler construction and upstream setup are outside warm clocks. First setup is not cold Node startup.',
        'readyIterable intentionally repeats normalization per file; readyRevision reuses a frozen candidate revision. Actual parse completeness remains required in both.',
        'Output equality includes complete Native metadata, not pixels/AT. No new winners, default integration, app/bundle/peak-memory or broad coverage claim; no CI timing gate.',
      ],
    },
    null,
    2,
  ),
)
