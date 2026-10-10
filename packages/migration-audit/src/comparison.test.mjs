import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { compareReports, comparisonMarkdown, validateBaseline } from './comparison.mjs'
import { AuditInputError, measureRealApp, runCli } from './index.mjs'

const clone = (value) => structuredClone(value)

test('installed static package settings permit CI comparison; metadata/config edits or missing install do not', async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-installed-config-'))
  const output = mkdtempSync(path.join(tmpdir(), 'hozo-installed-config-output-'))
  t.after(() => {
    rmSync(root, { recursive: true, force: true })
    rmSync(output, { recursive: true, force: true })
  })
  const files = {
    'app/Card.tsx': `import { View } from '@hozo/core'; export const Card = () => <View />`,
    'tsconfig.json':
      '{"extends":"@app/config", "compilerOptions":{"baseUrl":".","paths":{"@/*":["tokens/*"]},"plugins":[{"name":"./execute.cjs"}]}}',
    'execute.cjs': `throw new Error('app configuration must not execute')`,
    'node_modules/@app/config/package.json': '{"tsconfig":"./base.json","main":"./execute.cjs"}',
    'node_modules/@app/config/base.json':
      '{ // static JSONC\n "compilerOptions":{"strict":true}, }',
    'node_modules/@app/config/other.json': '{}',
    'node_modules/@app/config/execute.cjs': `throw new Error('package main must not execute')`,
    'tokens/sheet.ts': `import * as stylex from '@stylexjs/stylex'; export const styles = stylex.create({root:{padding:8}})`,
  }
  for (const [file, source] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    writeFileSync(path.join(root, file), source)
  }
  const snapshot = readdirSync(root, { recursive: true })
  const before = await measureRealApp({ root })
  assert.equal(before.analysis.projectFacts.aliases.status, 'resolved')
  assert.match(before.analysis.resolutionPolicy, /checkout-static-json-extends-v1/)
  assert.equal(before.scope.authoredFiles, 1)
  assert.equal(before.scope.contextModules, 0)
  assert.equal(before.analysis.configurationInputs.length, 3)
  assert.equal(before.lowering.webComponents, 1)
  assert.equal(before.lowering.nativeComponents, 1)
  assert.equal(before.lowering.parseOrCompileFailures, 0)
  assert.ok(!before.findings.some(({ code }) => /STYLEX.*UNRESOLVED/.test(code)))
  const baseline = path.join(output, 'baseline.json')
  writeFileSync(baseline, JSON.stringify(before))
  const args = [root, '--compare', baseline, '--fail-on', 'new-errors']
  const stdout = { write() {} }
  const same = await runCli(args, { stdout })
  assert.equal(same.comparison.status, 'comparable')
  assert.equal(same.failurePolicy.exitCode, 0)
  assert.equal(same.failurePolicy.newErrors, 0)
  const legacy = clone(before)
  legacy.analysis.resolutionPolicy = before.analysis.resolutionPolicy.replace(
    'checkout-static-json-extends-v1; ',
    '',
  )
  assert.equal(compareReports(before, legacy).status, 'not-comparable')
  assert.deepEqual(readdirSync(root, { recursive: true }), snapshot)
  for (const [file, source] of Object.entries(files))
    assert.equal(readFileSync(path.join(root, file), 'utf8'), source)
  const manifest = path.join(root, 'node_modules/@app/config/package.json')
  writeFileSync(manifest, '{"tsconfig":"./other.json"}')
  const changed = await runCli(args, { stdout })
  assert.equal(changed.comparison.status, 'not-comparable')
  assert.equal(changed.failurePolicy.status, 'blocked')
  assert.equal(changed.failurePolicy.newErrors, null)
  assert.equal(changed.corpus.sourceSha256, before.corpus.sourceSha256)
  assert.notEqual(
    changed.analysis.configurationInputs[1].sha256,
    before.analysis.configurationInputs[1].sha256,
  )
  writeFileSync(manifest, files['node_modules/@app/config/package.json'])
  writeFileSync(path.join(root, 'node_modules/@app/config/base.json'), '{}')
  const configChanged = await runCli(args, { stdout })
  assert.equal(configChanged.comparison.status, 'not-comparable')
  assert.equal(configChanged.failurePolicy.exitCode, 1)
  rmSync(path.join(root, 'node_modules/@app/config/base.json'))
  const missing = await runCli(args, { stdout })
  assert.equal(missing.analysis.projectFacts.aliases.status, 'unresolved')
  assert.equal(missing.failurePolicy.exitCode, 1)
  assert.equal(missing.failurePolicy.newErrors, null)
  assert.equal(missing.analysis.configurationInputs.length, 2)
})

function report() {
  const journal = { status: 'completed', scope: 'test-contract', outcomes: [] }
  return {
    schemaVersion: 3,
    corpus: {
      repository: 'test:app',
      sourceDirectories: ['src'],
      commit: 'before',
      sourceSha256: 'source',
    },
    toolchain: {
      auditVersion: '0.2.0',
      compilerVersion: '0.2.0',
      binding: { path: '/old/addon.node', sha256: 'binary' },
    },
    analysis: {
      contextStatus: 'prepared',
      sourceSelection: { include: null, exclude: [] },
      nativePlatform: 'android',
      resolutionPolicy: 'static',
      parserMode: 'extension-aware',
      compilerAssumptions: { theme: 'builtin', preflight: false },
      preflightBasis: { requested: 'auto' },
      primitiveSources: ['react-native'],
      stylesheetInputs: [],
      configurationInputs: [],
      contextModules: [],
      projectFacts: {
        css: { status: 'absent' },
        theme: { status: 'defaulted' },
        aliases: { status: 'absent' },
        stylexGraph: { status: 'resolved', value: { unresolvedImports: 0 } },
        fonts: { status: 'unresolved' },
      },
    },
    files: [
      {
        file: 'src/App.tsx',
        sourceSha256: 'unchanged',
        bindingsStatus: 'completed',
        stages: [],
        reactNativeUsage: { status: 'completed', bindings: [] },
        targets: {
          web: {
            status: 'completed',
            mode: 'web-module-lowering',
            platform: 'web',
            reactNativeImports: clone(journal),
            reactNativeReferences: clone(journal),
            reactNativeValues: clone(journal),
          },
        },
      },
    ],
    findings: [],
  }
}
function finding(snippet = 'hover:fill-red-500', line = 3, extra = {}) {
  return {
    file: 'src/App.tsx',
    backend: 'web',
    code: 'CANVAS_CLASS_NOT_LOWERED',
    stage: 'canvas',
    severity: 'warning',
    message: 'Keep the authored paint.',
    subject: { kind: 'diagnostic-span', snippet },
    location: { status: 'authored', spanStart: line * 10, spanEnd: line * 10 + 5, line, column: 1 },
    fingerprint: 'deliberately-not-unique-or-trusted',
    ...extra,
  }
}

test('line movement, Unicode/CRLF display spans and stage changes are not new findings', () => {
  const before = report()
  before.findings = [finding('同じ subject', 3), finding('other', 5, { backend: 'native' })]
  const after = clone(before)
  after.files[0].sourceSha256 = 'edited'
  after.corpus.commit = 'after'
  after.findings[0].location = finding('', 23).location
  after.findings[0].stage = 'different-stage'
  const snapshot = clone({ before, after })
  const comparison = compareReports(after, before)
  assert.equal(comparison.status, 'comparable')
  assert.equal(comparison.findings.continued.length, 2)
  assert.equal(comparison.findings.added.length, 0)
  assert.equal(comparison.findings.resolved.length, 0)
  assert.deepEqual(comparison.files.sourceChanged, ['src/App.tsx'])
  assert.deepEqual(
    comparison.provenanceChanges.map(({ field }) => field),
    ['corpus'],
  )
  assert.match(comparisonMarkdown(comparison), /3:1 → 23:1/)
  assert.deepEqual({ before, after }, snapshot)
})

test('unique subjects retain changed severity/message; distinct occurrences add/resolve', () => {
  const before = report()
  before.findings = [finding('continued'), finding('removed')]
  const after = clone(before)
  after.files[0].sourceSha256 = 'edited'
  after.findings = [
    finding('continued', 8, { severity: 'error', message: 'Review changed contract.' }),
    finding('new'),
  ]
  const comparison = compareReports(after, before)
  assert.equal(comparison.status, 'comparable')
  assert.equal(comparison.findings.changed.length, 1)
  assert.equal(comparison.findings.changed[0].before.severity, 'warning')
  assert.equal(comparison.findings.changed[0].after.severity, 'error')
  assert.equal(comparison.findings.added[0].after.subject.snippet, 'new')
  assert.equal(comparison.findings.resolved[0].before.subject.snippet, 'removed')
})

test('unchanged duplicates retain records but edited/count-changing clones are ambiguous', () => {
  const before = report()
  before.findings = [finding('same', 3), finding('same', 5)]
  assert.equal(compareReports(clone(before), before).findings.continued.length, 2)
  for (const keep of [1, 2, 3]) {
    const after = clone(before)
    after.files[0].sourceSha256 = 'edited'
    after.findings = Array.from({ length: keep }, (_, index) => finding('same', index + 8))
    const result = compareReports(after, before)
    assert.equal(result.status, 'partial')
    assert.equal(result.findings.notAssessed.length, 2 + keep)
    assert.equal(result.findings.added.length + result.findings.resolved.length, 0)
  }
})

test('file removal/moves are inventory changes, not silent finding resolutions', () => {
  const before = report()
  before.findings = [finding()]
  const after = clone(before)
  after.files[0].file = 'src/Moved.tsx'
  after.findings[0].file = 'src/Moved.tsx'
  const comparison = compareReports(after, before)
  assert.deepEqual(comparison.files.removed, ['src/App.tsx'])
  assert.deepEqual(comparison.files.added, ['src/Moved.tsx'])
  assert.equal(comparison.findings.resolved.length, 0)
  assert.equal(comparison.findings.added.length, 0)
  assert.equal(comparison.findings.notAssessed.length, 2)
  assert.equal(comparison.status, 'partial')
  assert.match(comparison.findings.notAssessed[1].reason, /possible move\/clone/)
})

test('an independently added authored file reports observations without a baseline boundary', () => {
  const before = report()
  const after = clone(before)
  after.files.push({ ...clone(after.files[0]), file: 'src/New.tsx' })
  after.findings = [finding('unique new subject', 3, { file: 'src/New.tsx' })]
  const result = compareReports(after, before)
  assert.equal(result.findings.added.length, 1)
  assert.deepEqual(result.files.added, ['src/New.tsx'])
  assert.equal(result.rewriteBoundaries.notAssessed.length, 1)
})

test('unmapped/file findings cannot acquire moved identity without an authored anchor', () => {
  for (const location of [
    { status: 'file' },
    { status: 'unmapped', reason: 'rewrite', spanStart: 1, spanEnd: 2 },
  ]) {
    const before = report()
    before.findings = [finding('', 3, { subject: undefined, location })]
    assert.equal(compareReports(clone(before), before).findings.continued.length, 1)
    const after = clone(before)
    after.files[0].sourceSha256 = 'edited'
    const result = compareReports(after, before)
    assert.equal(result.status, 'partial')
    assert.equal(result.findings.notAssessed.length, 1)
  }
})

test('acquiring/losing authored location confidence is not a new/resolved finding', () => {
  const before = report()
  before.findings = [finding('', 3, { subject: undefined, location: { status: 'unmapped' } })]
  const after = clone(before)
  after.findings = [finding()]
  for (const result of [compareReports(after, before), compareReports(before, after)]) {
    assert.equal(result.status, 'partial')
    assert.equal(result.findings.added.length + result.findings.resolved.length, 0)
    assert.equal(result.findings.notAssessed.length, 2)
  }
})

test('unique file-level diagnostics on unchanged source retain message/severity changes', () => {
  const before = report()
  before.findings = [finding('', 3, { subject: undefined, location: { status: 'file' } })]
  const after = clone(before)
  after.findings[0].message = 'An updated explanation'
  after.findings[0].severity = 'error'
  const result = compareReports(after, before)
  assert.equal(result.findings.changed.length, 1)
  assert.equal(result.findings.added.length + result.findings.resolved.length, 0)
  assert.equal(result.findings.changed[0].confidence, 'unchanged-source-and-unique-code')
})

test('scope/settings/hash changes are non-comparable even with lower observed totals', () => {
  const before = report()
  before.findings = [finding()]
  const changes = [
    (r) => {
      r.corpus.repository = 'different:app'
    },
    (r) => {
      r.corpus.sourceDirectories = ['app']
    },
    (r) => {
      r.analysis.sourceSelection.exclude = ['**/*.tsx']
    },
    (r) => {
      r.analysis.nativePlatform = 'ios'
    },
    (r) => {
      r.analysis.compilerAssumptions.preflight = true
    },
    (r) => {
      r.analysis.primitiveSources.push('@acme/ui')
    },
    (r) => {
      r.analysis.stylesheetInputs.push({ file: 'app.css', sha256: 'new-theme' })
    },
    (r) => {
      r.analysis.configurationInputs.push({ file: 'tsconfig.json', sha256: 'new-aliases' })
    },
    (r) => {
      r.analysis.contextModules.push({ file: 'tokens.ts', sha256: 'new-stylex' })
    },
  ]
  for (const change of changes) {
    const after = clone(before)
    change(after)
    after.findings = []
    const result = compareReports(after, before)
    assert.equal(result.status, 'not-comparable')
    assert.equal(result.findings.resolved.length, 0)
    assert.equal(result.findings.notAssessed.length, 1)
    assert.ok(result.reasons.length > 0)
  }
})

test('missing context, failed probes and changed target modes stay partial', () => {
  const before = report()
  before.findings = [finding()]
  const changes = [
    (r) => {
      r.analysis.contextStatus = 'partial'
    },
    (r) => {
      r.analysis.projectFacts.aliases.status = 'unsupported'
    },
    (r) => {
      r.analysis.projectFacts.stylexGraph.value.unresolvedImports = 1
    },
    (r) => {
      r.files[0].bindingsStatus = 'failed'
    },
    (r) => {
      r.files[0].stages = [{ status: 'failed' }]
    },
    (r) => {
      r.files[0].targets.web.status = 'failed'
    },
    (r) => {
      r.files[0].targets.web.mode = 'different-mode'
    },
    (r) => {
      delete r.files[0].targets.web
    },
  ]
  for (const change of changes) {
    const after = clone(before)
    change(after)
    after.findings = []
    const result = compareReports(after, before)
    assert.equal(result.status, 'partial')
    assert.equal(result.findings.resolved.length, 0)
    assert.equal(result.findings.notAssessed.length, 1)
  }
})

test('tool identity/source provenance is shown without a causal or runtime verdict', () => {
  const before = report()
  const after = clone(before)
  after.toolchain.binding.path = '/another-install/addon.node'
  assert.deepEqual(compareReports(after, before).provenanceChanges, [])
  after.toolchain.compilerVersion = '0.3.0'
  after.toolchain.binding.sha256 = 'new-binary'
  const result = compareReports(after, before)
  assert.equal(result.status, 'comparable')
  assert.deepEqual(
    result.provenanceChanges.map(({ field }) => field),
    ['toolchain'],
  )
  assert.match(comparisonMarkdown(result), /not causally attributed/)
})

test('boundary comparison joins recorded usage, ignores indices/spans and keeps unknown categories', () => {
  const before = report()
  const f = before.files[0]
  f.reactNativeUsage.bindings = [
    {
      imported: 'Platform',
      kind: 'import',
      typeOnly: false,
      references: [{ kind: 'runtime', access: 'static-member', member: 'OS' }],
    },
  ]
  f.targets.web.reactNativeValues.outcomes = [
    {
      bindingIndex: 0,
      referenceIndex: 0,
      disposition: 'rewritten-to-hozo',
      replacement: '@hozo/rn-compat',
      sourceEvidence: 'unchanged-module-run',
    },
  ]
  const after = clone(before)
  const outcomes = after.files[0].targets.web.reactNativeValues.outcomes
  outcomes[0].emittedSpan = { spanStart: 999, spanEnd: 1001 }
  assert.equal(compareReports(after, before).rewriteBoundaries.changed.length, 0)
  outcomes[0].disposition = 'not-assessed'
  outcomes[0].sourceEvidence = 'not-assessed'
  delete outcomes[0].replacement
  const result = compareReports(after, before)
  assert.equal(result.rewriteBoundaries.changed.length, 1)
  assert.match(JSON.stringify(result.rewriteBoundaries.changed), /not-assessed/)
  assert.equal(result.findings.added.length, 0)
  for (const status of ['partial', 'failed', 'not-assessed']) {
    after.files[0].targets.web.reactNativeValues.status = status
    const partial = compareReports(after, before)
    assert.equal(partial.status, 'partial')
    assert.equal(partial.rewriteBoundaries.changed.length, 0)
    assert.equal(partial.rewriteBoundaries.notAssessed.length, 1)
  }
  after.files[0].targets.web.reactNativeValues.status = 'completed'
  after.files[0].targets.web.reactNativeValues.scope = 'new-contract'
  assert.equal(compareReports(after, before).rewriteBoundaries.notAssessed.length, 1)
})

test('other schemas are explicitly non-comparable; malformed schema 3 is invalid', () => {
  assert.equal(compareReports(report(), { schemaVersion: 2 }).status, 'not-comparable')
  for (const invalid of [
    null,
    [],
    {},
    { schemaVersion: 3 },
    { ...report(), files: [null] },
    { ...report(), files: [...report().files, ...report().files] },
    { ...report(), findings: [finding('', 1, { file: 'not-in-inventory' })] },
  ]) {
    assert.throws(() => validateBaseline(invalid))
  }
})

test('member guidance edits are not reported as changed rewrite boundaries', () => {
  const before = report()
  before.files[0].reactNativeUsage.bindings = [
    {
      imported: 'Platform',
      kind: 'import',
      typeOnly: false,
      references: [{ kind: 'runtime', access: 'static-member', member: 'OS' }],
    },
  ]
  before.files[0].targets.web.reactNativeValues.outcomes = [
    {
      bindingIndex: 0,
      referenceIndex: 0,
      disposition: 'rewritten-to-hozo',
      replacement: '@hozo/rn-compat',
      sourceEvidence: 'unchanged-module-run',
      memberContract: { status: 'reviewed-adapter-subset', id: 'platform.os', summary: 'Before' },
    },
  ]
  const after = clone(before)
  after.files[0].targets.web.reactNativeValues.outcomes[0].memberContract.summary =
    'Clearer guidance'
  const result = compareReports(after, before)
  assert.equal(result.rewriteBoundaries.changed.length, 0)
  assert.deepEqual(result.rewriteBoundaries.continued, ['src/App.tsx'])
})

test('Native-only files are not counted as completed Web rewrite boundaries', () => {
  const before = report()
  before.files[0].targets = { native: { status: 'completed', mode: 'native-compiler-probe' } }
  const result = compareReports(clone(before), before)
  assert.deepEqual(result.rewriteBoundaries.notApplicable, ['src/App.tsx'])
  assert.equal(result.rewriteBoundaries.continued.length, 0)
  before.analysis.projectFacts.aliases.status = 'unsupported'
  const partial = compareReports(clone(before), before)
  assert.equal(partial.status, 'partial')
  assert.deepEqual(partial.rewriteBoundaries.notApplicable, ['src/App.tsx'])
  assert.equal(partial.rewriteBoundaries.notAssessed.length, 0)
})

test('Markdown display limits never cap comparison counts or --details', () => {
  const before = report()
  const after = clone(before)
  after.findings = Array.from({ length: 15 }, (_, index) =>
    finding(`subject-${index}`, index + 1, { code: `CHECK_${index}` }),
  )
  const result = compareReports(after, before)
  assert.equal(result.findings.added.length, 15)
  assert.match(comparisonMarkdown(result), /Findings: added \| 15/)
  assert.doesNotMatch(comparisonMarkdown(result), /CHECK\\_14/)
  assert.match(comparisonMarkdown(result, { details: true }), /CHECK\\_14/)
})

test('nested malformed baseline records are rejected rather than crashing comparison', () => {
  const changes = [
    (r) => {
      r.analysis.primitiveSources = 1
    },
    (r) => {
      r.analysis.stylesheetInputs = [null]
    },
    (r) => {
      r.corpus.sourceDirectories = {}
    },
    (r) => {
      r.files[0].targets.web = null
    },
    (r) => {
      r.files[0].stages = [null]
    },
    (r) => {
      r.files[0].reactNativeUsage = { bindings: [null] }
    },
    (r) => {
      r.files[0].targets.web.reactNativeValues.outcomes = [null]
    },
    (r) => {
      r.findings = [finding('', 1, { location: { status: 'authored' } })]
    },
  ]
  for (const change of changes) {
    const baseline = report()
    change(baseline)
    assert.throws(() => validateBaseline(baseline), /invalid schema 3/)
  }
})

test('CLI compares actual compiler subjects after CRLF/Unicode line insertion, without app writes', async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-baseline-'))
  const output = mkdtempSync(path.join(tmpdir(), 'hozo-baseline-output-'))
  t.after(() => {
    rmSync(root, { recursive: true, force: true })
    rmSync(output, { recursive: true, force: true })
  })
  const file = path.join(root, 'Shape.tsx')
  const source = `import { Canvas } from '@hozo/canvas'\r\nexport const Shape = () => <Canvas.Rect className="hover:fill-red-500" />`
  writeFileSync(file, source)
  const baseline = await measureRealApp({ root })
  const baselineFile = path.join(output, 'baseline.json')
  writeFileSync(baselineFile, JSON.stringify(baseline))
  const edited = `// 🪵 日本語\r\n\r\n${source}`
  writeFileSync(file, edited)
  const snapshot = readdirSync(root, { recursive: true })
  const stdout = {
    output: '',
    write(value) {
      this.output += value
    },
  }
  const result = await runCli(
    [root, '--compare', baselineFile, '--output', path.join(output, 'changes.md')],
    { stdout },
  )
  assert.equal(result.comparison.status, 'comparable')
  assert.equal(result.comparison.findings.continued.length, 2)
  assert.equal(result.comparison.findings.added.length, 0)
  for (const pair of result.comparison.findings.continued) {
    assert.equal(pair.after.location.line, pair.before.location.line + 2)
    assert.equal(pair.after.subject.snippet, pair.before.subject.snippet)
  }
  assert.match(readFileSync(path.join(output, 'changes.md'), 'utf8'), /Baseline comparison/)
  assert.equal(readFileSync(baselineFile, 'utf8'), JSON.stringify(baseline))
  assert.equal(readFileSync(file, 'utf8'), edited)
  assert.deepEqual(readdirSync(root, { recursive: true }), snapshot)
  stdout.output = ''
  const json = await runCli([root, '--compare', baselineFile], { stdout })
  assert.deepEqual(
    JSON.parse(stdout.output).comparison,
    JSON.parse(JSON.stringify(json.comparison)),
  )
  for (const contents of ['not json', '{}', '{"schemaVersion":3}']) {
    writeFileSync(baselineFile, contents)
    await assert.rejects(
      () => runCli([root, '--compare', baselineFile], { stdout }),
      AuditInputError,
    )
  }
  await assert.rejects(
    () => runCli([root, '--compare', path.join(output, 'missing.json')], { stdout }),
    AuditInputError,
  )
  writeFileSync(baselineFile, JSON.stringify(baseline))
  await assert.rejects(
    () => runCli([root, '--compare', baselineFile, '--output', baselineFile], { stdout }),
    AuditInputError,
  )
  assert.equal(readFileSync(baselineFile, 'utf8'), JSON.stringify(baseline))
  await assert.rejects(() => runCli([root, '--compare'], { stdout }), AuditInputError)
})

test('relocated checkouts with the same repository identity compare relative CSS inputs', async (t) => {
  const roots = [
    mkdtempSync(path.join(tmpdir(), 'hozo-css-before-')),
    mkdtempSync(path.join(tmpdir(), 'hozo-css-after-')),
  ]
  t.after(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true })
  })
  const reports = []
  for (const root of roots) {
    writeFileSync(
      path.join(root, 'App.tsx'),
      `import { View } from '@hozo/core'; export const x = <View className="bg-moss" />`,
    )
    writeFileSync(path.join(root, 'theme.css'), '@theme { --color-moss: #123456; }')
    reports.push(
      await measureRealApp({
        root,
        repository: 'test:same-app',
        css: 'theme.css',
        preflight: false,
      }),
    )
  }
  assert.deepEqual(
    reports[0].analysis.stylesheetInputs.map(({ file }) => file),
    ['theme.css'],
  )
  assert.deepEqual(reports[0].analysis.stylesheetInputs, reports[1].analysis.stylesheetInputs)
  assert.equal(compareReports(reports[1], reports[0]).status, 'comparable')
})

test('actual RN boundaries survive ordinary line movement and reflect changed member inventory', async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-boundary-compare-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const file = path.join(root, 'API.ts')
  const source = `import { Platform } from 'react-native'; export const x = Platform.OS`
  writeFileSync(file, source)
  const before = await measureRealApp({ root })
  writeFileSync(file, `\n// moved\n${source}`)
  const moved = compareReports(await measureRealApp({ root }), before)
  // The isolated checkout has no rn-compat installation. Its file-level setup
  // diagnostic has no source anchor; changing lines cannot certify its identity.
  // Actual completed RN journal counts still compare independently.
  assert.equal(moved.status, 'partial')
  assert.ok(
    moved.findings.notAssessed.every(({ before }) => before.code === 'RN_COMPAT_NOT_INSTALLED'),
  )
  assert.deepEqual(moved.rewriteBoundaries.continued, ['API.ts'])
  writeFileSync(file, source.replace('Platform.OS', 'Platform.select({web: 1})'))
  const changed = compareReports(await measureRealApp({ root }), before)
  assert.equal(changed.rewriteBoundaries.changed.length, 1)
  assert.match(JSON.stringify(changed.rewriteBoundaries.changed[0]), /select/)
})
