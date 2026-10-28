import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { cpus, platform, release } from 'node:os'
import { dirname, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  CODE_BLOCK_COUNTS,
  codeBlockFixture,
} from '../examples/native-showcase/src/code-block-fixture.ts'
import { codeText, normalizeCodeLines } from '../packages/typography/src/code/model.ts'
import { fromShiki } from '../packages/typography/src/code/shiki.ts'

const root = fileURLToPath(new URL('../', import.meta.url))
// Shiki belongs to the application. This illustrative producer uses its pinned
// dependency without adding a highlighter to a portable component package.
const require = createRequire(new URL('../apps/landing/package.json', import.meta.url))
const shikiURL = pathToFileURL(require.resolve('shiki')).href
const tokenizer = { language: 'typescript', theme: 'github-dark' }
const tokens = (lines) => lines.reduce((sum, line) => sum + line.tokens.length, 0)

if (process.argv[2] === '--cold') {
  const source = codeText(codeBlockFixture(1000, 0))
  const started = performance.now()
  const { createHighlighter } = await import(shikiURL)
  const imported = performance.now()
  const highlighter = await createHighlighter({
    themes: [tokenizer.theme],
    langs: [tokenizer.language],
  })
  const ready = performance.now()
  const highlighted = highlighter.codeToTokens(source, {
    lang: tokenizer.language,
    theme: tokenizer.theme,
  }).tokens
  const finished = performance.now()
  assert.equal(codeText(fromShiki(highlighted)), source)
  console.log(
    JSON.stringify({
      importMs: imported - started,
      setupMs: ready - imported,
      firstTokenizeMs: finished - ready,
      totalMs: finished - started,
      lines: highlighted.length,
      tokens: highlighted.reduce((sum, line) => sum + line.length, 0),
    }),
  )
  highlighter.dispose()
  process.exit(0)
}

const output = resolve(process.argv[2] ?? 'artifacts/code-block-preparation/result.json')
const started = performance.now()
const deadline = started + 60_000
const result = {
  scope:
    'Bounded Node/V8 preparation probe; no React render, Hermes, Native layout, GPU, network or source retrieval timing',
  source: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  capturedAt: new Date().toISOString(),
  host: {
    platform: platform(),
    release: release(),
    arch: process.arch,
    node: process.version,
    cpu: cpus()[0]?.model,
  },
  process: {},
  tokenizer,
  protocol: {
    samples: 7,
    warmups: 2,
    normalizeIterationsPerSample: 20,
    coldProcesses: 3,
    wallLimitMs: 60_000,
    forcedGC: false,
  },
  sources: {},
  cold: [],
  groups: [],
  complete: false,
}
mkdirSync(dirname(output), { recursive: true })
const inputs = [
  'scripts/measure-code-block-preparation.mjs',
  'examples/native-showcase/src/code-block-fixture.ts',
  'examples/native-showcase/src/CodeBlockPerformance.stories.tsx',
  'packages/typography/src/code/model.ts',
  'packages/typography/src/code/shiki.ts',
  'packages/typography/src/code-lines.native.tsx',
  'packages/patterns/src/code-block.native.tsx',
]
for (const file of inputs)
  result.sources[file] = createHash('sha256')
    .update(readFileSync(resolve(root, file)))
    .digest('hex')
const summary = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  return { medianMs: sorted[Math.floor(sorted.length / 2)], minMs: sorted[0], maxMs: sorted.at(-1) }
}
let retained
function measure(operation, run, validate, iterations = 1) {
  for (let index = 0; index < result.protocol.warmups; index++) retained = run()
  const batchMs = []
  for (let sample = 0; sample < result.protocol.samples; sample++) {
    assert.ok(performance.now() < deadline, 'preparation probe exceeded its fixed 60s bound')
    const before = performance.now()
    for (let index = 0; index < iterations; index++) retained = run()
    batchMs.push(performance.now() - before)
    validate(retained)
  }
  const perCallMs = batchMs.map((value) => value / iterations)
  return { operation, iterations, batchMs, perCallMs, ...summary(perCallMs) }
}

try {
  if (process.platform === 'win32')
    result.process = JSON.parse(
      execFileSync(
        'pwsh',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `$probe = Get-Process -Id ${process.pid}; [pscustomobject]@{ affinityMask = $probe.ProcessorAffinity.ToInt64(); priority = $probe.PriorityClass.ToString() } | ConvertTo-Json -Compress`,
        ],
        { encoding: 'utf8', timeout: 10_000, windowsHide: true },
      ),
    )
  result.fixtureMatrix = measure(
    "allocate the story's four revisions at every line count (outside its Native timing)",
    () =>
      CODE_BLOCK_COUNTS.map((count) =>
        [0, 1, 2, 3].map((revision) => codeBlockFixture(count, revision)),
      ),
    (matrix) =>
      assert.equal(
        matrix.flat().reduce((sum, lines) => sum + lines.length, 0),
        5640,
      ),
  )
  for (let index = 0; index < result.protocol.coldProcesses; index++) {
    const remaining = deadline - performance.now()
    assert.ok(remaining > 0)
    result.cold.push(
      JSON.parse(
        execFileSync(process.execPath, [fileURLToPath(import.meta.url), '--cold'], {
          encoding: 'utf8',
          timeout: Math.min(15_000, remaining),
          windowsHide: true,
        }),
      ),
    )
  }
  const { createHighlighter } = await import(shikiURL)
  const highlighter = await createHighlighter({
    themes: [tokenizer.theme],
    langs: [tokenizer.language],
  })
  try {
    for (const count of CODE_BLOCK_COUNTS) {
      const fixed = codeBlockFixture(count, 0)
      const source = codeText(fixed)
      const highlighted = highlighter.codeToTokens(source, {
        lang: tokenizer.language,
        theme: tokenizer.theme,
      }).tokens
      const group = {
        lines: count,
        sourceBytes: Buffer.byteLength(source),
        fixtureTokens: tokens(fixed),
        shikiTokens: highlighted.reduce((sum, line) => sum + line.length, 0),
        operations: [],
      }
      assert.equal(group.fixtureTokens, count * 8)
      group.operations.push(
        measure(
          'warm Shiki tokenization only',
          () =>
            highlighter.codeToTokens(source, { lang: tokenizer.language, theme: tokenizer.theme })
              .tokens,
          (value) => assert.equal(codeText(fromShiki(value)), source),
        ),
      )
      group.operations.push(
        measure(
          'fromShiki adapter only',
          () => fromShiki(highlighted),
          (value) => assert.equal(codeText(value), source),
          20,
        ),
      )
      group.operations.push(
        measure(
          'one normalization of precomputed 8-token lines',
          () => normalizeCodeLines(fixed),
          (value) => assert.equal(codeText(value), source),
          20,
        ),
      )
      group.operations.push(
        measure(
          'two normalizations as in Native CodeBlock -> CodeLines',
          () => normalizeCodeLines(normalizeCodeLines(fixed)),
          (value) => assert.equal(codeText(value), source),
          20,
        ),
      )
      // A source-derived React host-element estimate, NOT an Android View or
      // shadow-node count: RN may flatten Views and represent nested Text as spans.
      group.sourceDerivedElements = {
        views: 2 + 2 * count,
        texts: 1 + 2 * count + group.fixtureTokens,
        basis:
          'wrapped, copy-free, numbered Native source; excludes story controls/outer ScrollView',
      }
      result.groups.push(group)
    }
    const slice = codeBlockFixture(1000, 0).slice(400, 420)
    result.sliceControl = measure(
      'two normalizations of a preselected 20-line slice; not a windowing implementation',
      () => normalizeCodeLines(normalizeCodeLines(slice)),
      (value) => assert.equal(codeText(value), codeText(slice)),
      20,
    )
    result.coldSummary = summary(result.cold.map((sample) => sample.totalMs))
    result.complete = true
  } finally {
    highlighter.dispose()
  }
} catch (error) {
  result.error = String(error.stack)
  process.exitCode = 1
} finally {
  result.wallMs = performance.now() - started
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`)
  console.log(
    `CodeBlock preparation: ${result.complete ? 'complete' : 'incomplete'} in ${result.wallMs.toFixed(1)}ms; ${output}`,
  )
}
