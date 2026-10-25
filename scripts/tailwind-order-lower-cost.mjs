// Opt-in serial evidence for the real Web lowering pipeline, not a CI timer gate.
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
const { createCompiler } = await import('../packages/compiler/src/index.ts')
const lowering = await import('../packages/compiler/src/lower.ts')
const { TailwindProjectSession, TailwindCandidateUniverse } = await import(
  '../packages/compiler/src/tailwind-session.ts'
)
const { loadTheme, prepareTailwindOrder, tailwindPackageDir } = await import(
  '../packages/tailwind/src/theme.ts'
)
const { orderProvenance, summarizeOrderSamples } = await import(
  '../packages/tailwind-conformance/src/tailwind-order-cost.ts'
)
const base = tailwindPackageDir()
const css = readFileSync(path.join(base, 'theme.css'), 'utf8')
const theme = await loadTheme(css, base)
const compiler = createCompiler(theme)
const count = 16,
  // LCM(three old paths, four with the direct path): every path occupies
  // each clock position equally. All first observations remain included.
  samples = 12
const sources = Array.from({ length: count }, (_, index) => {
  const canvas = index % 4 === 0,
    stylex = index % 4 === 1
  return `import {Pressable,Text,Avatar} from '@hozo/core';
  ${canvas ? "import {Canvas} from '@hozo/canvas';" : ''}
  ${stylex ? "import * as stylex from '@stylexjs/stylex'; const styles=stylex.create({ink:{color:'#123456'}});" : ''}
  const padding='p-${index + 1}';export const Row=({ready,extra})=><Pressable className={padding}>
  <Avatar fallbackClassName="font-bold"/><Text ${stylex ? '{...stylex.props(styles.ink)}' : ''} className="text-lg hover:text-red-500">Row ${index} 😀</Text>
  ${canvas ? '<Canvas width={32} height={32}><Canvas.Rect width={24} height={24} className="fill-red-500"/></Canvas>' : ''}</Pressable>`
})
// Full known lexical universe, including the independent Canvas paint domain.
const universe = [
  ...Array.from({ length: count }, (_, index) => `p-${index + 1}`),
  'font-bold',
  'text-lg',
  'hover:text-red-500',
  'fill-red-500',
].sort()
compiler.setTailwindOrder(
  JSON.stringify((await prepareTailwindOrder(css, base, universe)).snapshot),
)
const fileFor = (index) => path.join(root, `artifacts/lower-cost/Row${index}.tsx`)
const idFor = (index) => `${fileFor(index)}${index % 3 === 0 ? '?fixture=derived' : ''}`
// Inputs an adapter already has; do not generate an extra id/path only for
// the per-file session calls inside their measurement clock.
const files = sources.map((_, index) => fileFor(index))
const ids = sources.map((_, index) => idFor(index))
const ordinary = () =>
  sources.map((source, index) =>
    lowering.lowerModule(source, ids[index], files[index], compiler, root),
  )
const expected = ordinary()
for (const output of expected) assert.ok(output?.code && output.css)
assert.match(expected[0].code, /fill=/)
assert.doesNotMatch(expected[0].code, /fill-red-500/)
const stages = { synchronous: [] }
let session,
  sessionPreparations = 0,
  firstSessionMs
const collectors = sources.map(
  (source, index) => (owner) =>
    lowering.prepareLowerModule(source, ids[index], files[index], owner, root),
)
const candidateUniverse = TailwindCandidateUniverse
  ? new TailwindCandidateUniverse(universe)
  : undefined
if (typeof lowering.prepareLowerModule === 'function') {
  stages.sessionReadyBatch = []
  stages.sessionReadyFiles = []
  if (typeof lowering.lowerModuleOrPrepare === 'function') stages.sessionReadyDirect = []
  session = new TailwindProjectSession(compiler, async (names) => {
    sessionPreparations++
    return JSON.stringify((await prepareTailwindOrder(css, base, names)).snapshot)
  })
  const start = performance.now()
  assert.deepEqual(await session.emit('batch', collectors, universe), expected)
  firstSessionMs = performance.now() - start
}
const stageOrder = []
const measure = async (stage) => {
  const start = performance.now()
  let output
  if (stage === 'synchronous') output = ordinary()
  else if (stage === 'sessionReadyBatch') output = await session.emit('batch', collectors, universe)
  else {
    output = []
    for (let index = 0; index < sources.length; index++) {
      if (stage === 'sessionReadyFiles') {
        const [value] = await session.emit(ids[index], [collectors[index]], universe)
        output.push(value)
      } else {
        output.push(
          await session.runModule(ids[index], candidateUniverse, (owner, context) =>
            lowering.lowerModuleOrPrepare(
              sources[index],
              ids[index],
              files[index],
              owner,
              root,
              context,
            ),
          ),
        )
      }
    }
  }
  stages[stage].push(performance.now() - start)
  assert.deepEqual(output, expected)
}
for (let sample = 0; sample < samples; sample++) {
  const keys = Object.keys(stages),
    offset = sample % keys.length
  const order = [...keys.slice(offset), ...keys.slice(0, offset)]
  stageOrder.push(order)
  for (const stage of order) await measure(stage)
}
if (session) {
  assert.equal(sessionPreparations, 1)
  session.invalidate()
}
console.log(
  JSON.stringify(
    {
      schema: 2,
      profile: 'debug',
      node: process.version,
      rust: execFileSync('rustc', ['--version'], { cwd: root, encoding: 'utf8' }).trim(),
      harnessSha256: createHash('sha256')
        .update(readFileSync(new URL(import.meta.url)))
        .digest('hex'),
      samples,
      modules: count,
      sourceBytes: sources.reduce((sum, source) => sum + Buffer.byteLength(source), 0),
      fixtureSha256: createHash('sha256').update(JSON.stringify(sources)).digest('hex'),
      outputSha256: createHash('sha256').update(JSON.stringify(expected)).digest('hex'),
      candidates: universe.length,
      themeColors: theme.colors.length,
      provenance: orderProvenance(),
      firstSessionMs,
      sessionPreparations,
      stageOrder,
      outputUnchanged: true,
      stages: Object.fromEntries(
        Object.entries(stages).map(([stage, values]) => [
          stage,
          summarizeOrderSamples(values, count),
        ]),
      ),
      limitations: [
        'Real Web lowerModule, 16 synthetic modules with nested Canvas, local StyleX, secondary slots, UTF-16 and derived IDs; not a whole app or Native module pipeline.',
        'Includes Canvas edits, primitive parsing/emission, namespaces, imports, diagnostics and cleanup. Theme/compiler construction and project preparation are outside synchronous/warm clocks.',
        'The staged path uses one full known lexical universe, not actual Vite/Metro watchers or project discovery. No new ordering winners.',
        'Stage order rotates per sample, with every sample retained. File IDs/paths and an immutable ready candidate universe are prepared outside clocks; no forced GC or discarded warm-up rounds.',
        'No startup/peak-memory, large-universe normalization, browser/device pixels/AT or production bundle measurement; all clock samples retained, no CI threshold or blanket speedup claim.',
      ],
    },
    null,
    2,
  ),
)
