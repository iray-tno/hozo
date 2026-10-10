import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { AuditInputError, evaluateFailurePolicy, measureRealApp, runCli } from './index.mjs'
import { failurePolicyMarkdown } from './policy.mjs'

const cli = fileURLToPath(new URL('./cli.mjs', import.meta.url))
const capture = () => ({
  output: '',
  write(value) {
    this.output += value
  },
})
function fixture(t, source = 'export const value = 1') {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-ci-policy-'))
  const output = mkdtempSync(path.join(tmpdir(), 'hozo-ci-policy-output-'))
  t.after(() => {
    rmSync(root, { recursive: true, force: true })
    rmSync(output, { recursive: true, force: true })
  })
  const file = path.join(root, 'App.tsx')
  writeFileSync(file, source)
  return { root, output, file }
}
const synthetic = (findings = []) => ({ findings, files: [] })

test('none is informational, error counts every backend error without using capped summaries', () => {
  const report = synthetic([
    { backend: 'source', severity: 'error' },
    ...Array.from({ length: 25 }, (_, index) => ({
      backend: index % 2 ? 'web' : 'native',
      severity: 'error',
    })),
    { severity: 'warning' },
  ])
  report.diagnostics = { bySeverity: { error: 0 } }
  report.samples = { errors: [] }
  const before = structuredClone(report)
  assert.equal(evaluateFailurePolicy(report).exitCode, 0)
  const failed = evaluateFailurePolicy(report, 'error')
  assert.equal(failed.status, 'failed')
  assert.equal(failed.exitCode, 1)
  assert.equal(failed.currentErrors, 26)
  assert.deepEqual(
    failed.errorFindings,
    Array.from({ length: 26 }, (_, index) => index),
  )
  assert.equal(failed.newErrors, null)
  assert.deepEqual(report, before)
  assert.throws(() => evaluateFailurePolicy(report, 'warning'), TypeError)
})

test('new-errors counts additions and warning escalation, not old/message-only errors', () => {
  const report = synthetic([{ severity: 'error' }])
  report.comparison = {
    status: 'comparable',
    findings: {
      added: [{ after: { severity: 'warning' } }, { after: { severity: 'error' } }],
      changed: [
        { before: { severity: 'warning' }, after: { severity: 'error' } },
        {
          before: { severity: 'error', message: 'old' },
          after: { severity: 'error', message: 'new' },
        },
        { before: { severity: 'error' }, after: { severity: 'warning' } },
      ],
      continued: [{ after: { severity: 'error' } }],
      resolved: [{ before: { severity: 'error' } }],
    },
  }
  const result = evaluateFailurePolicy(report, 'new-errors')
  assert.equal(result.exitCode, 1)
  assert.equal(result.newErrors, 2)
  assert.deepEqual(result.newErrorFindings, [
    { category: 'added', index: 1 },
    { category: 'changed', index: 0 },
  ])
  report.comparison.findings.added = []
  report.comparison.findings.changed.shift()
  const passed = evaluateFailurePolicy(report, 'new-errors')
  assert.equal(passed.status, 'passed')
  assert.equal(passed.newErrors, 0)
  assert.equal(passed.currentErrors, 1)
})

test('missing/partial/incompatible comparison is blocked, never zero new errors', () => {
  for (const status of [undefined, 'partial', 'not-comparable']) {
    const report = synthetic()
    if (status)
      report.comparison = {
        status,
        reasons: ['Unresolved project facts.'],
        findings: { added: [], changed: [] },
      }
    const result = evaluateFailurePolicy(report, 'new-errors')
    assert.equal(result.status, 'blocked')
    assert.equal(result.exitCode, 1)
    assert.equal(result.newErrors, null)
    assert.equal(result.newErrorFindings, null)
    assert.match(result.reasons.join(' '), /requires a comparable baseline/)
    if (status) assert.ok(result.reasons.includes('Unresolved project facts.'))
  }
})

test('compiler failures cannot be suppressed by none or a continued-error baseline', () => {
  for (const mode of ['none', 'error', 'new-errors']) {
    const report = synthetic([{ code: 'ANALYSIS_FAILED', severity: 'error' }])
    report.comparison = { status: 'comparable', findings: { added: [], changed: [] } }
    const result = evaluateFailurePolicy(report, mode)
    assert.equal(result.status, 'failed')
    assert.equal(result.exitCode, 1)
    assert.deepEqual(result.analysisFailures, [0])
    assert.match(result.reasons[0], /compiler analysis failure/)
  }
  const report = synthetic()
  report.files = [{ file: 'App.tsx', stages: [{ status: 'failed' }], targets: {} }]
  assert.deepEqual(evaluateFailurePolicy(report).incompleteFiles, ['App.tsx'])
  assert.equal(evaluateFailurePolicy(report).exitCode, 1)
  report.findings.push({ file: 'App.tsx', code: 'SOURCE_SYNTAX_ERROR', severity: 'error' })
  assert.equal(evaluateFailurePolicy(report).exitCode, 0)
  assert.equal(evaluateFailurePolicy(report, 'error').exitCode, 1)
})

test('CLI applies recorded exits and saves syntax-error evidence before failing', (t) => {
  const { root, output, file } = fixture(t, 'export const value = ;')
  const snapshot = readdirSync(root, { recursive: true })
  for (const [args, expected] of [
    [[], 0],
    [['--fail-on', 'none'], 0],
    [['--fail-on', 'error'], 1],
  ]) {
    const destination = path.join(output, `syntax-${args.length ? args[1] : 'default'}.json`)
    const result = spawnSync(process.execPath, [cli, root, ...args, '--output', destination], {
      encoding: 'utf8',
    })
    assert.equal(result.status, expected, result.stderr)
    assert.match(result.stdout, /Wrote /)
    const report = JSON.parse(readFileSync(destination, 'utf8'))
    assert.ok(report.findings.some(({ code }) => code === 'SOURCE_SYNTAX_ERROR'))
    assert.equal(report.failurePolicy.exitCode, expected)
    assert.equal(report.failurePolicy.newErrors, null)
    assert.deepEqual(report.failurePolicy.incompleteFiles, [])
    if (expected) assert.match(result.stderr, /^hozo-migration-audit: .*current error/)
    else assert.equal(result.stderr, '')
  }
  assert.equal(readFileSync(file, 'utf8'), 'export const value = ;')
  assert.deepEqual(readdirSync(root, { recursive: true }), snapshot)
})

test('CLI blocks incomplete context and different scope/schema but writes both observations', async (t) => {
  const { root, output } = fixture(t)
  const baseline = await measureRealApp({ root })
  const baselineFile = path.join(output, 'baseline.json')
  for (const kind of ['partial', 'scope', 'schema']) {
    const previous = structuredClone(baseline)
    if (kind === 'partial') previous.analysis.projectFacts.aliases = { status: 'unsupported' }
    if (kind === 'scope') previous.analysis.nativePlatform = 'ios'
    writeFileSync(baselineFile, JSON.stringify(kind === 'schema' ? { schemaVersion: 2 } : previous))
    const before = readFileSync(baselineFile, 'utf8')
    const destination = path.join(output, `${kind}.json`)
    const result = spawnSync(
      process.execPath,
      [cli, root, '--compare', baselineFile, '--fail-on', 'new-errors', '--output', destination],
      { encoding: 'utf8' },
    )
    assert.equal(result.status, 1, result.stderr)
    assert.equal(result.stderr.trim().split(/\r?\n/).length, 1)
    assert.match(result.stderr, /requires a comparable baseline/)
    const report = JSON.parse(readFileSync(destination, 'utf8'))
    assert.equal(report.failurePolicy.status, 'blocked')
    assert.equal(report.failurePolicy.newErrors, null)
    assert.equal(report.files.length, 1)
    assert.equal(report.comparison.status, kind === 'partial' ? 'partial' : 'not-comparable')
    assert.equal(readFileSync(baselineFile, 'utf8'), before)
  }
})

test('comparable real audits catch new Native errors, tolerate continued errors and warnings', async (t) => {
  const { root, output, file } = fixture(t)
  const baselineFile = path.join(output, 'baseline.json')
  const audit = () => measureRealApp({ root, preflight: false })
  const baseline = await audit()
  writeFileSync(baselineFile, JSON.stringify(baseline))
  const source = `import { View } from '@hozo/core'; export const App = () => <View className="[&>x]:p-2" />`
  writeFileSync(file, source)
  const argv = [root, '--preflight', 'false', '--compare', baselineFile, '--fail-on', 'new-errors']
  const originalExitCode = process.exitCode
  const stdout = capture()
  const failed = await runCli(argv, { stdout })
  assert.equal(process.exitCode, originalExitCode)
  assert.equal(failed.comparison.status, 'comparable')
  assert.ok(failed.failurePolicy.newErrors > 0)
  assert.equal(failed.failurePolicy.exitCode, 1)
  assert.ok(
    failed.findings.some((finding) => finding.backend === 'native' && finding.severity === 'error'),
  )
  const destination = path.join(output, 'new-errors.json')
  const failure = spawnSync(process.execPath, [cli, ...argv, '--output', destination], {
    encoding: 'utf8',
  })
  assert.equal(failure.status, 1, failure.stderr)
  assert.match(failure.stderr, /added or severity-escalated error/)
  const saved = JSON.parse(readFileSync(destination, 'utf8'))
  assert.deepEqual(saved.failurePolicy, failed.failurePolicy)
  assert.equal(saved.findings.length, failed.findings.length)
  assert.match(failure.stdout, /Wrote /)
  writeFileSync(baselineFile, JSON.stringify(failed))
  const passed = spawnSync(process.execPath, [cli, ...argv], { encoding: 'utf8' })
  assert.equal(passed.status, 0, passed.stderr)
  const report = JSON.parse(passed.stdout)
  assert.ok(report.failurePolicy.currentErrors > 0)
  assert.equal(report.failurePolicy.newErrors, 0)
  assert.equal(report.failurePolicy.status, 'passed')
  writeFileSync(
    file,
    `import { Canvas } from '@hozo/canvas'; export const Shape = () => <Canvas.Rect className="hover:fill-red-500" />`,
  )
  const warnings = await audit()
  assert.ok(warnings.findings.length > 0)
  assert.ok(warnings.findings.every((finding) => finding.severity === 'warning'))
  writeFileSync(baselineFile, JSON.stringify(warnings))
  const markdown = capture()
  const warningResult = await runCli([...argv, '--format', 'markdown'], { stdout: markdown })
  assert.equal(warningResult.failurePolicy.exitCode, 0)
  assert.match(markdown.output, /CI failure policy/)
  assert.match(markdown.output, /Status \/ exit code \| passed \/ 0/)
})

test('real ambiguous subjects, file removal and syntax rejection cannot pass new-errors', async (t) => {
  const source = `import { Canvas } from '@hozo/canvas'; export const App = () => <>
    <Canvas.Rect className="hover:fill-red-500" /><Canvas.Rect className="hover:fill-red-500" />
  </>`
  const { root, output, file } = fixture(t, source)
  const baseline = await measureRealApp({ root })
  const baselineFile = path.join(output, 'baseline.json')
  writeFileSync(baselineFile, JSON.stringify(baseline))
  const argv = [root, '--compare', baselineFile, '--fail-on', 'new-errors']
  writeFileSync(file, `// shifted duplicates\n${source}`)
  const ambiguous = await runCli(argv, { stdout: capture() })
  assert.equal(ambiguous.comparison.status, 'partial')
  assert.ok(ambiguous.comparison.findings.notAssessed.some((item) => /Duplicate/.test(item.reason)))
  assert.equal(ambiguous.failurePolicy.exitCode, 1)
  assert.equal(ambiguous.failurePolicy.newErrors, null)
  rmSync(file)
  writeFileSync(path.join(root, 'Other.tsx'), 'export const value = 1')
  const removed = await runCli(argv, { stdout: capture() })
  assert.deepEqual(removed.comparison.files.removed, ['App.tsx'])
  assert.equal(removed.failurePolicy.status, 'blocked')
  assert.equal(removed.failurePolicy.newErrors, null)
  writeFileSync(file, 'export const App = () => <')
  const syntax = await runCli(argv, { stdout: capture() })
  assert.ok(syntax.findings.some(({ code }) => code === 'SOURCE_SYNTAX_ERROR'))
  assert.equal(syntax.failurePolicy.status, 'blocked')
  assert.equal(syntax.failurePolicy.newErrors, null)
})

test('invalid policy and missing/malformed baseline fail briefly before any output is written', async (t) => {
  const { root, output } = fixture(t)
  const baseline = path.join(output, 'invalid.json')
  const destination = path.join(output, 'report.json')
  writeFileSync(baseline, '{}')
  for (const args of [
    ['--fail-on'],
    ['--fail-on', 'warning'],
    ['--fail-on', 'new-errors'],
    ['--fail-on', 'none', '--compare', baseline],
    ['--fail-on', 'new-errors', '--compare', path.join(output, 'missing.json')],
  ]) {
    const result = spawnSync(process.execPath, [cli, root, ...args, '--output', destination], {
      encoding: 'utf8',
    })
    assert.equal(result.status, 1)
    assert.equal(result.stderr.trim().split(/\r?\n/).length, 1)
    assert.match(result.stderr, /^hozo-migration-audit:/)
    assert.equal(result.stdout, '')
    assert.deepEqual(readdirSync(output), ['invalid.json'])
  }
  await assert.rejects(
    () => runCli([path.join(root, 'missing'), '--fail-on', 'new-errors'], { stdout: capture() }),
    (error) => error instanceof AuditInputError && /requires --compare/.test(error.message),
  )
  const help = spawnSync(process.execPath, [cli, '--help'], { encoding: 'utf8' })
  assert.equal(help.status, 0)
  assert.match(help.stdout, /--fail-on none\|error\|new-errors/)
})

test('Markdown keeps blocked and unknown evidence distinct and escapes reason content', () => {
  const policy = evaluateFailurePolicy(synthetic(), 'new-errors')
  policy.reasons.push('[bad](https://example.test)\n| injected')
  const markdown = failurePolicyMarkdown(policy)
  assert.match(markdown, /blocked \/ 1/)
  assert.match(markdown, /errors \| not assessed/)
  assert.match(markdown, /Unknowns remain in the report/)
  assert.match(markdown, /\\\[bad\\\]\\\(https:\/\/example.test\\\) \\\| injected/)
})
