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
const { TailwindProjectSession } = await import('../packages/compiler/src/tailwind-session.ts')
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
  samples = 7
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
const ordinary = () =>
  sources.map((source, index) =>
    lowering.lowerModule(source, idFor(index), fileFor(index), compiler, root),
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
    lowering.prepareLowerModule(source, idFor(index), fileFor(index), owner, root),
)
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
for (let sample = 0; sample < samples; sample++) {
  let start = performance.now()
  const control = ordinary()
  stages.synchronous.push(performance.now() - start)
  assert.deepEqual(control, expected)
  if (!session) continue
  start = performance.now()
  const batch = await session.emit('batch', collectors, universe)
  stages.sessionReadyBatch.push(performance.now() - start)
  assert.deepEqual(batch, expected)
  start = performance.now()
  const files = []
  for (let index = 0; index < sources.length; index++) {
    const [output] = await session.emit(idFor(index), [collectors[index]], universe)
    files.push(output)
  }
  stages.sessionReadyFiles.push(performance.now() - start)
  assert.deepEqual(files, expected)
  if (stages.sessionReadyDirect) {
    start = performance.now()
    const direct = []
    for (let index = 0; index < sources.length; index++) {
      direct.push(
        await session.runModule(idFor(index), universe, (owner, context) =>
          lowering.lowerModuleOrPrepare(
            sources[index],
            idFor(index),
            fileFor(index),
            owner,
            root,
            context,
          ),
        ),
      )
    }
    stages.sessionReadyDirect.push(performance.now() - start)
    assert.deepEqual(direct, expected)
  }
}
if (session) {
  assert.equal(sessionPreparations, 1)
  session.invalidate()
}
console.log(
  JSON.stringify(
    {
      schema: 1,
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
        'No startup/peak-memory, large-universe normalization, browser/device pixels/AT or production bundle measurement; all clock samples retained, no CI threshold or blanket speedup claim.',
      ],
    },
    null,
    2,
  ),
)
