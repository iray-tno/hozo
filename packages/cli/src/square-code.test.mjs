import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { run } from './index.mjs'

const capture = () => {
  const stream = {
    output: '',
    write(value) {
      stream.output += value
    },
  }
  return stream
}

// The compiler the audit loads: a project at its version builds with it.
const COMPILER = createRequire(import.meta.url)('@hozo/compiler/package.json').version

/** A project with `@hozo/core` installed and the given files. */
function project(t, files, version = COMPILER) {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-square-code-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const write = (file, contents) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    writeFileSync(path.join(root, file), contents)
  }
  write('package.json', JSON.stringify({ name: 'app', dependencies: { '@hozo/core': version } }))
  write('node_modules/@hozo/core/package.json', JSON.stringify({ name: '@hozo/core', version }))
  for (const [file, contents] of Object.entries(files)) write(file, contents)
  return { root, write }
}

async function square(...argv) {
  const io = { stdout: capture(), stderr: capture() }
  const exit = await run(['square', ...argv], io)
  return { exit, stdout: io.stdout.output, stderr: io.stderr.output }
}

const CLEAN =
  'import { View } from \'@hozo/core\'\nexport const App = () => <View className="p-4" />\n'
// `hover:` has no state to read on a plain View on Native: an error there.
const HOVER =
  'import { View } from \'@hozo/core\'\nexport const Card = () => <View className="hover:p-2" />\n'

test('the code half compiles the project and embeds the audit report', async (t) => {
  const { root, write } = project(t, { 'src/App.tsx': CLEAN })
  const clean = await square(root, '--format', 'json')
  assert.equal(clean.exit, 0, clean.stderr)
  const report = JSON.parse(clean.stdout)
  assert.equal(report.code.status, 'passed')
  assert.equal(report.code.summary, '1 file on Web and Native: 0 errors, 0 warnings')
  // The whole schema 3 report: what `hozo dry-fit --format json` writes.
  assert.equal(report.code.report.schemaVersion, 3)
  assert.equal(report.code.report.corpus.name, 'app')
  assert.equal(report.code.report.failurePolicy.mode, 'error')

  write('src/Card.tsx', HOVER)
  const text = await square(root)
  assert.equal(text.exit, 1)
  assert.match(text.stdout, /\nCode\n {2}FAIL {2}2 files on Web and Native: 1 error, 0 warnings\n/)
  assert.match(text.stdout, /\n {8}error {3}src\/Card\.tsx:2:\d+ \(native\) `hover:` .*\[/)
  assert.match(text.stdout, /\n1 error, 0 warnings\.\n$/)
  assert.equal(text.stderr, 'hozo square: Code: 1 current error finding(s).\n')
  assert.equal((await square(root, '--fail-on', 'none')).exit, 0)
})

test('a project on another compiler version is told whose compiler measured it', async (t) => {
  // An older release than the one this CLI brings, as `npx` fetches the latest.
  const { root } = project(t, { 'src/App.tsx': CLEAN }, '0.0.1')
  const text = await square(root)
  // A warning: the findings are still reported, against the CLI's compiler.
  assert.equal(text.exit, 0, text.stderr)
  assert.match(
    text.stdout,
    new RegExp(
      `\\n {8}warning Measured with @hozo/compiler ${COMPILER.replaceAll('.', '\\.')}, while the project builds with 0\\.0\\.1 \\(its @hozo/\\* packages\\); a finding here may not be the build's \\[compiler-version-mismatch\\]\\n {16}Fix: Run the CLI at the project's version: npx @hozo/cli@0\\.0\\.1 square\\n`,
    ),
  )
  assert.match(text.stdout, /\n0 errors, 1 warning\.\n$/)

  const json = JSON.parse((await square(root, '--format', 'json')).stdout)
  assert.deepEqual(json.code.compiler, { measuredWith: COMPILER, project: '0.0.1' })
  assert.equal(json.code.findings[0].code, 'compiler-version-mismatch')
  const strict = await square(root, '--fail-on', 'warning')
  assert.equal(strict.exit, 1)
  assert.match(strict.stderr, /Code: Measured with another compiler than the project's\./)

  // The project's own @hozo/compiler, when an adapter brings one, is the one compared.
  const { root: matched, write } = project(t, { 'src/App.tsx': CLEAN }, '0.0.1')
  write(
    'node_modules/@hozo/core/package.json',
    JSON.stringify({
      name: '@hozo/core',
      version: '0.0.1',
      dependencies: { '@hozo/compiler': COMPILER },
    }),
  )
  write(
    'node_modules/@hozo/compiler/package.json',
    JSON.stringify({ name: '@hozo/compiler', version: COMPILER }),
  )
  const own = JSON.parse((await square(matched, '--format', 'json', '--fail-on', 'none')).stdout)
  assert.deepEqual(own.code.findings, [])
})

test('--compare: only an error the baseline did not have fails new-errors', async (t) => {
  const { root, write } = project(t, { 'src/App.tsx': CLEAN, 'src/Card.tsx': HOVER })
  const baselines = mkdtempSync(path.join(tmpdir(), 'hozo-square-baseline-'))
  t.after(() => rmSync(baselines, { recursive: true, force: true }))
  // Either report can be the baseline: square's own, or dry-fit's.
  const squareBaseline = path.join(baselines, 'square.json')
  writeFileSync(
    squareBaseline,
    (await square(root, '--format', 'json', '--fail-on', 'none')).stdout,
  )
  const dryFit = { stdout: capture(), stderr: capture() }
  await run(['dry-fit', root, '--format', 'json'], dryFit)
  const dryFitBaseline = path.join(baselines, 'dry-fit.json')
  writeFileSync(dryFitBaseline, dryFit.stdout.output)

  for (const baseline of [squareBaseline, dryFitBaseline]) {
    const same = await square(root, '--compare', baseline, '--fail-on', 'new-errors')
    assert.equal(same.exit, 0, `${baseline}: ${same.stderr}`)
    assert.match(same.stdout, /1 error, 0 warnings; 0 new errors since the baseline\n/)
  }

  write('src/App.tsx', CLEAN.replace('p-4', 'hover:p-4'))
  const added = await square(root, '--compare', squareBaseline, '--fail-on', 'new-errors')
  assert.equal(added.exit, 1)
  assert.match(added.stdout, /2 errors, 0 warnings; 1 new error since the baseline\n/)
  assert.equal(added.stderr, 'hozo square: Code: 1 added or severity-escalated error finding(s).\n')

  // A new file is compared like any other: its error is new.
  write('src/App.tsx', CLEAN)
  write('src/Other.tsx', HOVER.replace('Card', 'Other').replace('p-2', 'm-3'))
  const another = await square(root, '--compare', squareBaseline, '--fail-on', 'new-errors')
  assert.equal(another.exit, 1)
  assert.match(another.stdout, /2 errors, 0 warnings; 1 new error since the baseline\n/)

  // A new file with the very finding an existing file has may be that file
  // moved or copied: the engine calls it neither new nor old, and
  // new-errors fails closed, as dry-fit does.
  write('src/Other.tsx', HOVER.replace('Card', 'Other'))
  const grown = await square(root, '--compare', squareBaseline, '--fail-on', 'new-errors')
  assert.equal(grown.exit, 1)
  assert.match(grown.stdout, /; not comparable with the baseline \(partial\)\n/)
  assert.match(grown.stderr, /new-errors requires a comparable baseline; comparison is partial/)
})

test('a fatal setup finding skips the code half, and says which', async (t) => {
  const { root } = project(t, {
    'src/App.tsx': CLEAN,
    'vite.config.ts':
      "import react from '@vitejs/plugin-react'\nexport default { plugins: [react()] }\n",
  })
  const { exit, stdout } = await square(root, '--format', 'json')
  assert.equal(exit, 1)
  const report = JSON.parse(stdout)
  assert.deepEqual(report.code, {
    status: 'skipped',
    reason: 'Not run: the adapter check leaves nothing to compile [adapter-not-configured]',
  })
})

test('a baseline or policy square cannot use exits 2 before the audit', async (t) => {
  const { root } = project(t, { 'src/App.tsx': CLEAN })
  const setupOnly = path.join(root, 'setup-only.json')
  writeFileSync(setupOnly, (await square(root, '--setup', '--format', 'json')).stdout)
  for (const [argv, code, message] of [
    [['--fail-on', 'new-errors'], 'missing-compare', /needs --compare/],
    [['--compare', path.join(root, 'missing.json')], 'invalid-baseline', /cannot read baseline/],
    [['--compare', setupOnly], 'invalid-baseline', /code half did not run \(Not run: --setup\)/],
    [['--compare', path.join(root, 'package.json')], 'invalid-baseline', /cannot compare/],
    [['--setup', '--compare', setupOnly], 'invalid-option', /which --setup skips/],
    [['--compare'], 'missing-value', /takes a JSON report/],
  ]) {
    const result = await square(root, ...argv)
    assert.equal(result.exit, 2, argv.join(' '))
    assert.match(result.stderr, new RegExp(`^hozo square: .* \\[${code}\\]\\n$`), argv.join(' '))
    assert.match(result.stderr, message, argv.join(' '))
  }
})
