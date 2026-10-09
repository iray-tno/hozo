import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { recordAnalysis } from './evidence.mjs'
import { AuditInputError, measureRealApp, renderRealAppMarkdown, runCli } from './index.mjs'

test('actual tag decisions aggregate separately from retained imports and never certify prop/API uses', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-rn-tags-audit-'))
  try {
    mkdirSync(path.join(root, 'src'))
    writeFileSync(
      path.join(root, 'src', 'app.tsx'),
      `// 😀\nimport { View, Text, Platform } from 'react-native'; const x = <View custom={View}>{Platform.OS}<Text /></View>; const factory = View`,
    )
    const report = await measureRealApp({ root })
    const tags = report.reactNativeReferenceDecisions
    assert.equal(tags.filesCompleted, 1)
    assert.equal(tags.unmappedTags, 0)
    assert.equal(tags.replacedJsxTags, 3)
    assert.equal(tags.notAssessedReferences, 3)
    assert.equal(report.reactNativeImportDecisions.retainedBindings, 2)
    assert.equal(tags.nonJsxReferences, 'not-assessed')
    assert.equal(tags.memberCompatibility, 'not-assessed')
    const file = report.files[0]
    const journal = file.targets.web.reactNativeReferences
    assert.equal(journal.outcomes.length, 6)
    const tag = journal.outcomes.find((item) => item.replacement === 'span')
    assert.equal(
      file.reactNativeUsage.bindings[tag.bindingIndex].references[tag.referenceIndex].access,
      'jsx',
    )
    assert.match(renderRealAppMarkdown(report), /Web React Native JSX tag decisions/)
    assert.match(renderRealAppMarkdown(report), /unknown does not mean retained or unsupported/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('partial and failed tag journals retain evidence without padding successful totals', () => {
  const report = {
    files: [],
    findings: [],
    analysis: { stageDurationMs: {} },
    samples: {},
    diagnostics: { byCode: {}, bySeverity: {} },
    _compileFailures: new Set(),
    _filesWithErrors: new Set(),
    _filesWithWarnings: new Set(),
  }
  for (const status of ['partial', 'failed']) {
    recordAnalysis(
      report,
      {
        targets: {
          web: {
            status: status === 'failed' ? 'failed' : 'completed',
            reactNativeReferences: {
              status,
              scope: 'jsx-tag-emissions',
              unmappedTags: 1,
              outcomes: [
                {
                  bindingIndex: 0,
                  referenceIndex: 0,
                  disposition: 'replaced-jsx-tag',
                  replacement: 'div',
                  reason: 'emitted before failure',
                },
              ],
            },
          },
        },
        stages: [],
        findings: [],
      },
      `${status}.tsx`,
      'source',
      'shared',
    )
  }
  assert.equal(report.reactNativeReferenceDecisions.filesPartial, 1)
  assert.equal(report.reactNativeReferenceDecisions.filesFailed, 1)
  assert.equal(report.reactNativeReferenceDecisions.replacedJsxTags, 0)
  assert.equal(report.reactNativeReferenceDecisions.unmappedTags, 2)
  assert.equal(report.files[0].targets.web.reactNativeReferences.outcomes.length, 1)
})

test('aborted import journals stay in file evidence but do not enter successful rewrite counts', () => {
  const report = {
    files: [],
    findings: [],
    analysis: { stageDurationMs: {} },
    samples: {},
    diagnostics: { byCode: {}, bySeverity: {} },
    _compileFailures: new Set(),
    _filesWithErrors: new Set(),
    _filesWithWarnings: new Set(),
  }
  recordAnalysis(
    report,
    {
      targets: {
        web: {
          status: 'failed',
          reactNativeImports: {
            status: 'failed',
            scope: 'import-declarations',
            unmappedDecisions: 0,
            outcomes: [
              {
                bindingIndex: 0,
                disposition: 'rewritten-to-hozo',
                replacement: '@hozo/rn-compat',
                reason: 'actual edit before failure',
              },
            ],
          },
        },
      },
      stages: [],
      findings: [],
    },
    'app.tsx',
    'source',
    'shared',
  )
  assert.equal(report.reactNativeImportDecisions.filesFailed, 1)
  assert.equal(report.reactNativeImportDecisions.rewrittenBindings, 0)
  assert.equal(report.files[0].targets.web.reactNativeImports.outcomes.length, 1)
  assert.equal(report.reactNativeUsage.filesNotAssessed, 1)
})

test('RN source census excludes types, unused values and shadowed names from runtime references', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-rn-usage-audit-'))
  try {
    mkdirSync(path.join(root, 'src'))
    const source = `// 😀\r\nimport { Platform as P, Animated, Keyboard, Dimensions, type ViewStyle } from 'react-native'\r\nimport type { TextStyle } from 'react-native'\r\nconst os = P.OS; const timing = Animated.timing; const dynamic = P[key]\r\nfunction shadow(P) { return P.OS }\r\ntype D = typeof Dimensions; let a: ViewStyle; let b: TextStyle\r\nexport { Platform } from 'react-native'; export type { ViewProps } from 'react-native'\r\nimport 'react-native'`
    const file = path.join(root, 'src', 'app.ts')
    writeFileSync(file, source)
    const before = readdirSync(root, { recursive: true })
    const report = await measureRealApp({ root })
    assert.equal(report.lowering.parseOrCompileFailures, 0)
    const usage = report.reactNativeUsage
    assert.equal(usage.filesAssessed, 1)
    assert.equal(usage.filesNotAssessed, 0)
    assert.equal(usage.importBindings, 6)
    assert.equal(usage.explicitTypeImports, 2)
    assert.equal(usage.importsUsedOnlyAsTypes, 1)
    assert.equal(usage.unusedValueImports, 1)
    assert.equal(usage.runtimeReferences, 3)
    assert.equal(usage.typeReferences, 3)
    assert.equal(usage.dynamicMemberReferences, 1)
    assert.equal(usage.runtimeReexports, 1)
    assert.equal(usage.typeReexports, 1)
    assert.equal(usage.sideEffectImports, 1)
    assert.equal(usage.rewriteDecisions, 'web-import-declarations-and-jsx-tags')
    assert.equal(report.reactNativeImportDecisions.filesCompleted, 1)
    assert.equal(report.reactNativeImportDecisions.rewrittenBindings, 3)
    assert.equal(report.reactNativeImportDecisions.retainedBindings, 1)
    assert.equal(report.reactNativeImportDecisions.typeOnlyBindings, 2)
    assert.equal(report.reactNativeImportDecisions.notAssessedEdges, 3)
    assert.equal(report.reactNativeImportDecisions.semanticReferences, 'not-assessed')
    assert.equal(report.reactNativeImports.Platform, 1)
    const journal = report.files[0].targets.web.reactNativeImports
    assert.equal(journal.outcomes[0].replacement, '@hozo/rn-compat')
    assert.equal(journal.outcomes[1].disposition, 'retained-react-native')
    const bindings = report.files[0].reactNativeUsage.bindings
    assert.equal(bindings[0].references.length, 2)
    const span = bindings[0].references[0]
    assert.equal(source.slice(span.spanStart, span.spanEnd), 'P.OS')
    assert.match(renderRealAppMarkdown(report), /Authored React Native usage/)
    assert.match(renderRealAppMarkdown(report), /Web React Native import decisions/)
    assert.match(
      renderRealAppMarkdown(report),
      /Retained imports are not remaining runtime-use counts/,
    )
    assert.deepEqual(readdirSync(root, { recursive: true }), before)
    assert.equal(readFileSync(file, 'utf8'), source)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('measures platform-aware residue after DOM style arrays are normalized', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-migration-audit-'))
  try {
    const source = path.join(root, 'src')
    mkdirSync(source)
    writeFileSync(
      path.join(source, 'Shared.tsx'),
      `import { Text as RNText, View } from 'react-native'
export function Shared() {
  return <View style={[{ display: 'flex' }, { padding: 4 }]}><RNText>Hello</RNText></View>
}
`,
    )
    writeFileSync(
      path.join(source, 'Spinner.native.tsx'),
      `import { ActivityIndicator } from 'react-native'
export function Spinner() { return <ActivityIndicator /> }
`,
    )
    writeFileSync(
      path.join(source, 'Syntax.tsx'),
      `import { Animated, SectionList, View } from 'react-native'
const ref = useAnimatedRef<View>()
// <View /> is documentation, not a rendered dependency.
export function Syntax() { return <><Animated.View /><SectionList /></> }
`,
    )
    execFileSync('git', ['init', '--quiet'], { cwd: root })
    execFileSync('git', ['config', 'user.name', 'Hozo Test'], { cwd: root })
    execFileSync('git', ['config', 'user.email', 'test@hozo.invalid'], { cwd: root })
    execFileSync('git', ['add', '.'], { cwd: root })
    execFileSync('git', ['commit', '--quiet', '-m', 'fixture'], { cwd: root })

    const report = await measureRealApp({ root, source: 'src', name: 'fixture' })
    assert.equal(report.scope.tsxFiles, 3)
    assert.equal(report.lowering.parseOrCompileFailures, 0)
    assert.equal(report.review.confirmedWrongOutputFiles, 0)
    assert.equal(report.review.invalidDomStyleArrayOccurrences, 0)
    assert.equal(report.lowering.filesWithDirectReactNativeJsxResidueOnWeb, 1)
    assert.equal(report.lowering.directReactNativeJsxBindingsResidueOnWeb, 1)
    assert.deepEqual(report.reactNativeJsxResidueImports, { SectionList: 1 })

    // Every lowered file, named, beside what the compiler recognised in it.
    //
    // #457's report claimed six lowered files for a corpus whose authored
    // surface imported nothing lowerable, and gave no way to check that from
    // outside: two totals that disagreed, and not one filename between them.
    // Each entry is `<path>: <imports>`, and the path is relative to the
    // checkout -- `src/Shared.tsx`, not `Shared.tsx`.
    //
    // Both assertions carry the list in their message. The first version of
    // this anchored the path at the start of the line, failed, and said only
    // "the expression evaluated to a falsy value" -- which cannot distinguish
    // a wrong path from a file that lowered with nothing recognised in it.
    // Those two mean very different things, and one round trip was spent not
    // knowing which had happened.
    const loweredBy = report.samples.loweredBy ?? []
    const listed = JSON.stringify(loweredBy)
    assert.equal(loweredBy.length, report.lowering.filesLowered)
    assert.ok(
      loweredBy.some((entry) => /Shared\.tsx: .*react-native/.test(entry)),
      `no lowered file names Shared.tsx with a react-native import: ${listed}`,
    )
    // A file that lowered with nothing recognised in it reads as `(none)`,
    // which is #457's contradiction with somewhere to go and look. These all
    // have a reason, so none of them say it.
    assert.ok(
      !loweredBy.some((entry) => entry.endsWith('(none)')),
      `a file lowered with nothing recognised in it: ${listed}`,
    )

    const markdown = renderRealAppMarkdown(report)
    assert.match(markdown, /Real-app measurement: fixture/)
    assert.match(markdown, /DOM style-array invariant holds/)
    assert.match(markdown, /Invalid DOM style-array occurrences \| 0/)
    assert.match(markdown, /npx @hozo\/migration-audit/)
    assert.match(markdown, /RNW cannot yet be removed at the JSX boundary/)

    report.lowering.filesWithDirectReactNativeJsxResidueOnWeb = 0
    report.lowering.directReactNativeJsxBindingsResidueOnWeb = 0
    report.reactNativeJsxResidueImports = {}
    const complete = renderRealAppMarkdown(report)
    assert.match(complete, /direct RN JSX boundary is closed/)
    assert.match(complete, /\| None \| 0 \|/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// A corpus with nothing to lower, which is where #457 started.
//
// Envarly is plain React 19 DOM plus Tailwind in a Tauri webview: no React
// Native, no Hozo, no ALF. Its report still said six files lowered and
// twenty-four components emitted, and the issue read that as numbers leaking
// in from some other corpus.
//
// This fixture is the same shape, and it lowers nothing -- which is what the
// compiler should do, and which leaves that report's numbers unexplained
// rather than explained. It is here as the floor: if a change ever makes a
// corpus like this lower something, that is the mechanism #457 is asking
// about, and this test is where it shows up.
test('a className-only corpus with no React Native lowers nothing', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-migration-audit-dom-'))
  try {
    const source = path.join(root, 'src')
    mkdirSync(source)
    writeFileSync(
      path.join(source, 'Card.tsx'),
      `export function Card() {
  return <div className="flex items-center gap-2"><span>Card</span></div>
}
`,
    )
    writeFileSync(
      path.join(source, 'Panel.tsx'),
      `export function Panel() {
  return <div className="flex-col p-4"><p>Panel</p></div>
}
`,
    )
    execFileSync('git', ['init', '--quiet'], { cwd: root })
    execFileSync('git', ['config', 'user.name', 'Hozo Test'], { cwd: root })
    execFileSync('git', ['config', 'user.email', 'test@hozo.invalid'], { cwd: root })
    execFileSync('git', ['add', '.'], { cwd: root })
    execFileSync('git', ['commit', '--quiet', '-m', 'fixture'], { cwd: root })

    const report = await measureRealApp({ root, source: 'src', name: 'dom-only' })
    assert.equal(report.authoredSignals.filesImportingReactNative, 0)
    assert.equal(report.authoredSignals.filesWithDirectReactNativeJsx, 0)
    assert.equal(Object.hasOwn(report.authoredSignals, 'filesUsingAlfAtoms'), false)
    assert.equal(report.authoredSignals.filesWithClassName, 2)
    // `flex` alone, not `flex-col`: one file, not two.
    assert.equal(report.authoredSignals.filesWithBareFlexClassName, 1)
    // Nothing lowers, and that is the point. A project compiler receives its
    // trusted source list, so a tag lowers only when its binding was imported
    // from one of those sources. Bare local names are application components,
    // even when they happen to be spelled like a Hozo primitive.
    assert.equal(report.lowering.filesLoweredForWeb, 0)
    assert.equal(report.lowering.webComponents, 0)
    assert.equal(report.lowering.filesLowered, 0)
    // And nothing is listed as having lowered. The sample is there to name
    // files, not to be there.
    assert.equal(report.samples.loweredBy, undefined)

    const markdown = renderRealAppMarkdown(report)
    assert.match(markdown, /\*\*Styling surface:\*\* 2 of 2 files use `className`/)
    assert.match(markdown, /1 write a bare `flex` class/)
    // The sentence this replaced called a className corpus "not
    // className-shaped" and put inline styles first.
    assert.doesNotMatch(markdown, /not className-shaped/)
    assert.doesNotMatch(markdown, /Inline-style compatibility is therefore/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// Regression for #457. A same-file component used to bypass import-source
// checking because only imported foreign names were tracked; the parser then
// fell back from a missing alias to the bare name `Text` and lowered it.
test('a locally declared component named like a primitive does not lower', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-migration-audit-local-'))
  try {
    const source = path.join(root, 'src')
    mkdirSync(source)
    writeFileSync(
      path.join(source, 'Local.tsx'),
      `function Text({ children }) {
  return <span className="font-bold">{children}</span>
}
export function Panel() {
  return <Text>hello</Text>
}
`,
    )
    execFileSync('git', ['init', '--quiet'], { cwd: root })
    execFileSync('git', ['config', 'user.name', 'Hozo Test'], { cwd: root })
    execFileSync('git', ['config', 'user.email', 'test@hozo.invalid'], { cwd: root })
    execFileSync('git', ['add', '.'], { cwd: root })
    execFileSync('git', ['commit', '--quiet', '-m', 'fixture'], { cwd: root })

    const report = await measureRealApp({ root, source: 'src', name: 'local-primitive' })
    // Nothing is imported at all, so every authored signal that could explain
    // a lowering count reads zero -- including the foreign one, which only
    // sees imports.
    assert.equal(report.authoredSignals.filesImportingReactNative, 0)
    assert.equal(report.authoredSignals.filesWithDirectReactNativeJsx, 0)
    assert.equal(report.authoredSignals.filesWithForeignPrimitiveNames, 0)

    assert.equal(report.lowering.filesLowered, 0)
    assert.equal(report.lowering.filesLoweredForWeb, 0)
    assert.equal(report.lowering.filesLoweredForNative, 0)
    assert.equal(report.lowering.webComponents, 0)
    assert.equal(report.lowering.nativeComponents, 0)
    assert.deepEqual(report.samples.loweredBy ?? [], [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// `npx @hozo/migration-audit .` used to fail with `Missing value for .`.
test('the CLI accepts the checkout as a positional argument', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-migration-audit-cli-'))
  try {
    const source = path.join(root, 'src')
    mkdirSync(source)
    writeFileSync(path.join(source, 'App.tsx'), 'export function App() { return <div /> }\n')
    const out = path.join(root, 'audit.json')
    const report = await runCli([root, '--output', out])
    assert.equal(report.corpus.name, path.basename(root))
    assert.equal(report.scope.tsxFiles, 1)
    assert.match(readFileSync(out, 'utf8'), /"schemaVersion": 3/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

function fixture(t, files) {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-audit-discovery-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const [file, source] of Object.entries(files)) {
    const destination = path.join(root, file)
    mkdirSync(path.dirname(destination), { recursive: true })
    writeFileSync(destination, source)
  }
  return root
}

const simpleSource = 'export function App() { return <div /> }\n'
function checkoutSnapshot(root) {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => [
      path.relative(root, path.join(entry.parentPath, entry.name)),
      readFileSync(path.join(entry.parentPath, entry.name)).toString('base64'),
    ])
    .sort(([a], [b]) => a.localeCompare(b))
}

test('discovers app without src and scans both when src and app coexist', async (t) => {
  const appRoot = fixture(t, { 'app/index.tsx': simpleSource })
  const app = await measureRealApp({ root: appRoot })
  assert.deepEqual(app.corpus.sourceDirectories, ['app'])
  assert.equal(app.scope.tsxFiles, 1)
  const bothRoot = fixture(t, { 'src/Shared.tsx': simpleSource, 'app/index.tsx': simpleSource })
  const both = await measureRealApp({ root: bothRoot })
  assert.deepEqual(both.corpus.sourceDirectories, ['src', 'app'])
  assert.equal(both.scope.tsxFiles, 2)
  const markdown = renderRealAppMarkdown(both)
  assert.match(
    markdown,
    /`src\/\*\*\/\*\.\{tsx,jsx,ts,js,mts,mjs\}`, `app\/\*\*\/\*\.\{tsx,jsx,ts,js,mts,mjs\}`/,
  )
  assert.match(markdown, /--source "src" --source "app"/)
})

test('an empty src does not hide app or root-level TSX', async (t) => {
  const appRoot = fixture(t, {
    'app/index.tsx': simpleSource,
  })
  mkdirSync(path.join(appRoot, 'src'))
  assert.deepEqual((await measureRealApp({ root: appRoot })).corpus.sourceDirectories, ['app'])
  const root = fixture(t, { 'App.tsx': simpleSource })
  mkdirSync(path.join(root, 'src'))
  assert.deepEqual((await measureRealApp({ root })).corpus.sourceDirectories, ['.'])
})

test('root fallback excludes dependencies and generated output', async (t) => {
  const root = fixture(t, {
    'App.tsx': simpleSource,
    'components/Card.tsx': simpleSource,
    'node_modules/library/Bad.tsx': 'not valid TSX !!!',
    '.git/Bad.tsx': 'not valid TSX !!!',
    '.next/Bad.tsx': 'not valid TSX !!!',
    '.expo/Bad.tsx': 'not valid TSX !!!',
    'dist/Bad.tsx': 'not valid TSX !!!',
    'build/Bad.tsx': 'not valid TSX !!!',
    'coverage/Bad.tsx': 'not valid TSX !!!',
    'artifacts/Bad.tsx': 'not valid TSX !!!',
  })
  const report = await measureRealApp({ root })
  assert.equal(report.scope.tsxFiles, 2)
  assert.equal(report.lowering.parseOrCompileFailures, 0)
})

test('root discovery does not follow a directory symlink back into the checkout', async (t) => {
  const root = fixture(t, { 'App.tsx': simpleSource })
  symlinkSync(root, path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir')
  assert.equal((await measureRealApp({ root })).scope.tsxFiles, 1)
})

test('explicit sources override discovery and overlapping sources are deduplicated', async (t) => {
  const root = fixture(t, {
    'src/App.tsx': simpleSource,
    'app/index.tsx': simpleSource,
    'custom/Card.tsx': simpleSource,
  })
  const report = await measureRealApp({ root, source: 'custom' })
  assert.deepEqual(report.corpus.sourceDirectories, ['custom'])
  assert.equal(report.scope.tsxFiles, 1)
  const stdout = {
    isTTY: false,
    output: '',
    write(value) {
      this.output += value
    },
  }
  await runCli([root, '--source', '.', '--source', 'src'], { stdout })
  assert.equal(JSON.parse(stdout.output).scope.tsxFiles, 3)
})

test('no JS/TS, missing source, source file and missing checkout are input errors', async (t) => {
  const root = fixture(t, { 'app/readme.md': 'not source' })
  await assert.rejects(() => measureRealApp({ root }), {
    name: 'Error',
    message: /No JS\/TS.*--source/,
  })
  for (const source of ['missing', 'app/index.jsx']) {
    await assert.rejects(() => measureRealApp({ root, source }), AuditInputError)
  }
  await assert.rejects(() => measureRealApp({ root: path.join(root, 'missing') }), AuditInputError)
  const cli = fileURLToPath(new URL('./cli.mjs', import.meta.url))
  const result = spawnSync(process.execPath, [cli, root], { encoding: 'utf8' })
  assert.equal(result.status, 1)
  assert.equal(result.stdout, '')
  assert.match(result.stderr, /^hozo-migration-audit: No JS\/TS.*--source[^\r\n]*\r?\n$/)
  assert.doesNotMatch(result.stderr, /ENOENT|at walk|node:fs/)
})

test('terminal output is Markdown, pipes are JSON, and explicit formats win', async (t) => {
  const root = fixture(t, { 'src/App.tsx': simpleSource })
  for (const [isTTY, args, format] of [
    [true, [], 'markdown'],
    [false, [], 'json'],
    [true, ['--format', 'json'], 'json'],
    [false, ['--format', 'markdown'], 'markdown'],
  ]) {
    const stdout = {
      isTTY,
      output: '',
      write(value) {
        this.output += value
      },
    }
    await runCli([root, ...args], { stdout })
    if (format === 'json') assert.equal(JSON.parse(stdout.output).schemaVersion, 3)
    else assert.match(stdout.output, /^# Real-app measurement:/)
  }
  const md = path.join(root, 'report.md')
  const stdout = { isTTY: false, write() {} }
  await runCli([root, '--output', md], { stdout })
  assert.match(readFileSync(md, 'utf8'), /^# Real-app measurement:/)
  await runCli([root, '--output', md, '--format', 'json'], { stdout })
  assert.equal(JSON.parse(readFileSync(md, 'utf8')).schemaVersion, 3)
})

test('help succeeds without a checkout and argument errors have no stack trace', async () => {
  const cli = fileURLToPath(new URL('./cli.mjs', import.meta.url))
  const help = spawnSync(process.execPath, [cli, '--help'], { encoding: 'utf8' })
  assert.equal(help.status, 0)
  assert.match(help.stdout, /JS\/TS.*\.tsx\/\.jsx/)
  assert.equal(help.stderr, '')
  for (const args of [[], ['--source'], ['.', '--unknown', 'x']]) {
    const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' })
    assert.equal(result.status, 1)
    assert.equal(result.stderr.trim().split(/\r?\n/).length, 1)
    assert.match(result.stderr, /^hozo-migration-audit:/)
  }
})

test('Bluesky-style corpus signals are opt-in and do not leak into generic output', async (t) => {
  const root = fixture(t, {
    'src/App.tsx':
      'const atoms = { box: {} }; export function App() { return <div style={atoms.box} /> }',
  })
  const generic = await measureRealApp({ root })
  assert.equal(generic.corpusSignals, undefined)
  assert.equal(Object.hasOwn(generic.authoredSignals, 'filesUsingAlfAtoms'), false)
  assert.doesNotMatch(renderRealAppMarkdown(generic), /ALF|filesUsingAlfAtoms/)
  const report = await measureRealApp({
    root,
    fileSignals: { filesUsingAlfAtoms: (source) => /\batoms(?:\.|\[)/.test(source) },
  })
  assert.deepEqual(report.corpusSignals, { filesUsingAlfAtoms: 1 })
  assert.equal(report.scope.tsxFiles, generic.scope.tsxFiles)
  assert.deepEqual(report.lowering, generic.lowering)
  const markdown = renderRealAppMarkdown(report)
  assert.match(markdown, /Corpus-specific signals/)
  assert.match(markdown, /filesUsingAlfAtoms \| 1/)
  assert.match(markdown, /heuristics supplied by the corpus runner/)
  await assert.rejects(
    () => measureRealApp({ root, expectedCommit: 'not-the-pinned-commit' }),
    AuditInputError,
  )
  report.lowering.parseOrCompileFailures = 1
  assert.match(renderRealAppMarkdown(report), /The corpus has parse or compile failures/)
  assert.doesNotMatch(renderRealAppMarkdown(report), /The corpus parses cleanly/)
})

test('full Canvas findings exceed sample limits and details preserve all messages', async (t) => {
  const source = `import { Canvas } from '@hozo/canvas'
export const App = () => <Canvas.Rect className="hover:fill-red-500" />`
  const root = fixture(
    t,
    Object.fromEntries(Array.from({ length: 15 }, (_, index) => [`src/Shape${index}.tsx`, source])),
  )
  const report = await measureRealApp({ root })
  assert.equal(report.schemaVersion, 3)
  assert.equal(report.findings.length, 30)
  assert.equal(report.diagnostics.byCode.CANVAS_CLASS_NOT_LOWERED, 30)
  assert.equal(report.samples['diagnostic:CANVAS_CLASS_NOT_LOWERED'].length, 12)
  assert.equal(report.scope.authoredFiles, 15)
  assert.equal(report.scope.contextModules, 0)
  assert.equal(report.lowering.filesLowered, 0)
  assert.equal(report.files.length, 15)
  assert.ok(report.files.every((file) => file.targets.web.mode === 'web-module-lowering'))
  assert.ok(report.files.every((file) => file.targets.native.mode === 'native-compiler-probe'))
  const stdout = {
    isTTY: false,
    output: '',
    write(value) {
      this.output += value
    },
  }
  await runCli([root, '--details', '--format', 'markdown'], { stdout })
  assert.match(stdout.output, /Shape14\.tsx/)
  assert.equal(stdout.output.match(/web\/canvas/g).length, 15)
  assert.equal(stdout.output.match(/native\/canvas/g).length, 15)
  assert.match(renderRealAppMarkdown(report), /30 complete finding records/)
  assert.match(JSON.stringify(report), /hover:fill-red-500/)
})

test('provenance records actual binding, stable authored fingerprint and unresolved project facts', async (t) => {
  const root = fixture(t, { 'src/App.tsx': simpleSource })
  const report = await measureRealApp({ root })
  const second = await measureRealApp({ root })
  assert.match(report.toolchain.binding.sha256, /^[a-f0-9]{64}$/)
  assert.equal(report.toolchain.binding.sha256, second.toolchain.binding.sha256)
  assert.ok(report.toolchain.binding.path.endsWith('.node'))
  assert.equal(report.corpus.dirty, null)
  assert.equal(report.corpus.sourceSha256, second.corpus.sourceSha256)
  assert.equal(report.analysis.projectFacts.theme.status, 'defaulted')
  assert.equal(report.analysis.projectFacts.stylexGraph.status, 'resolved')
  assert.equal(report.analysis.productionBuild, 'not-assessed')
  assert.equal(report.analysis.runtimeBehavior, 'not-assessed')
  assert.ok(report.analysis.stageDurationMs['web:module-lowering'] >= 0)
  writeFileSync(path.join(root, 'src/App.tsx'), `${simpleSource}// edited\n`)
  assert.notEqual((await measureRealApp({ root })).corpus.sourceSha256, report.corpus.sourceSha256)
})

test('JS/TS inventory, globs, declarations and extension eligibility are explicit', async (t) => {
  const root = fixture(t, {
    'packages/app/Card.jsx': `import { View } from 'react-native'; export const Card = () => <View />`,
    'packages/app/API.js': `import { Platform } from 'react-native'; export const os = Platform.OS`,
    'packages/app/token.ts': 'export const n = 1',
    'packages/app/module.mts': 'export const n = 2',
    'packages/app/module.mjs': 'export const n = 3',
    'packages/app/Skip.tsx': simpleSource,
    'packages/app/types.d.ts': 'invalid !!!',
    'packages/app/types.d.mts': 'invalid !!!',
    'packages/app/generated/Bad.tsx': 'invalid !!!',
    'node_modules/lib/Bad.js': 'invalid !!!',
  })
  const stdout = {
    output: '',
    write(value) {
      this.output += value
    },
  }
  const report = await runCli(
    [
      root,
      '--source',
      'packages/app',
      '--include',
      'packages/**/*.js',
      '--include',
      'packages/**/*.{jsx,ts,mts,mjs,tsx}',
      '--exclude',
      '**/generated/**',
      '--exclude',
      '**/Skip.tsx',
      '--native-platform',
      'ios',
    ],
    { stdout },
  )
  assert.equal(report.scope.authoredFiles, 5)
  assert.equal(report.scope.tsxFiles, 0)
  assert.equal(report.scope.excludedFiles, 4)
  assert.equal(report.lowering.parseOrCompileFailures, 0)
  const jsx = report.files.find(({ file }) => file.endsWith('Card.jsx'))
  assert.equal(jsx.targets.web.integrationEligibility, 'runtime-imports-only')
  assert.equal(jsx.targets.web.semanticComponents, 0)
  assert.equal(jsx.targets.native.integrationEligibility, 'compiler-probe-only')
  assert.equal(jsx.targets.native.platform, 'ios')
  assert.equal(report.lowering.sharedBackendShapeMismatches, 0)
  assert.match(renderRealAppMarkdown(report), /not Metro eligibility/)
  for (const option of [
    { include: [] },
    { exclude: ['../outside/**'] },
    { nativePlatform: 'windows' },
  ])
    await assert.rejects(() => measureRealApp({ root, ...option }), AuditInputError)
})

test('cross-file StyleX context is read-only and remains outside authored scope', async (t) => {
  const root = fixture(t, {
    'app/Card.tsx': `import * as stylex from '@stylexjs/stylex'; import { View } from '@hozo/core'; import { styles } from '../tokens/barrel'; export const Card = () => <View {...stylex.props(styles.root)} />`,
    'tokens/barrel.ts': `export { styles } from './sheet'`,
    'tokens/sheet.ts': `import * as stylex from '@stylexjs/stylex'; export const styles = stylex.create({root:{padding:16}})`,
    'metro.config.js': `throw new Error('must never execute')`,
  })
  const before = checkoutSnapshot(root)
  const report = await measureRealApp({ root, source: 'app' })
  assert.equal(report.scope.authoredFiles, 1)
  assert.equal(report.scope.contextModules, 2)
  assert.deepEqual(
    report.files.map(({ file }) => file),
    ['app/Card.tsx'],
  )
  assert.equal(report.lowering.webComponents, 1)
  assert.equal(report.lowering.nativeComponents, 1)
  assert.ok(!report.findings.some(({ code }) => /STYLEX.*UNRESOLVED/.test(code)))
  assert.ok(report.analysis.graphResolutions.some(({ resolved }) => resolved === 'tokens/sheet.ts'))
  assert.deepEqual(checkoutSnapshot(root), before)
  symlinkSync(
    path.join(root, 'tokens'),
    path.join(root, 'linked'),
    process.platform === 'win32' ? 'junction' : 'dir',
  )
  await assert.rejects(() => measureRealApp({ root, source: 'linked' }), AuditInputError)
})

test('valid non-JSX TS generic arrows parse without expanding integration eligibility', async (t) => {
  const root = fixture(t, { 'src/generic.ts': 'export const identity = <T>(value: T): T => value' })
  const report = await measureRealApp({ root })
  assert.equal(report.lowering.parseOrCompileFailures, 0)
  assert.equal(report.diagnostics.filesWithErrors, 0)
  assert.deepEqual(report.findings, [])
  assert.equal(report.files[0].targets.web.integrationEligibility, 'runtime-imports-only')
  assert.equal(report.files[0].targets.native.integrationEligibility, 'compiler-probe-only')
  assert.match(renderRealAppMarkdown(report), /extension-aware syntax parsing/)
})

test('JS/TS grammar failures remain errors rather than unassessed TSX probe warnings', async (t) => {
  const root = fixture(t, {
    'src/generic.tsx': 'export const identity = <T>(value: T) => value',
    'src/typed.js': 'export const value: number = 1',
    'src/broken.ts': '// 😀 日本語\r\nexport const value = ;',
  })
  const report = await measureRealApp({ root })
  assert.equal(report.lowering.parseOrCompileFailures, 3)
  assert.equal(report.diagnostics.filesWithErrors, 3)
  assert.ok(report.findings.every(({ code }) => code === 'SOURCE_SYNTAX_ERROR'))
  assert.ok(report.files.every(({ targets }) => targets.web.status === 'failed'))
  assert.match(renderRealAppMarkdown(report), /boundary is not fully assessed/)
})

test('module warnings and syntax failures are visible without falsely closing RN boundaries', async (t) => {
  const root = fixture(t, {
    'src/API.web.tsx': `import { Platform } from 'react-native'; export const platform = Platform.OS`,
    'src/Invalid.tsx': 'export const App = () => <',
  })
  const report = await measureRealApp({ root })
  assert.equal(report.lowering.parseOrCompileFailures, 1)
  assert.equal(report.diagnostics.filesWithErrors, 1)
  const syntax = report.findings.find((finding) => finding.code === 'SOURCE_SYNTAX_ERROR')
  assert.ok(syntax)
  assert.equal(syntax.backend, 'source')
  assert.equal(syntax.stage, 'syntax')
  const missing = report.findings.find((finding) => finding.code === 'RN_COMPAT_NOT_INSTALLED')
  assert.ok(missing)
  assert.equal(missing.stage, 'resolution')
  assert.deepEqual(missing.location, { status: 'file' })
  assert.equal(
    report.files.find((file) => file.file.endsWith('API.web.tsx')).targets.native,
    undefined,
  )
  assert.match(renderRealAppMarkdown(report), /boundary is not fully assessed/)
  assert.doesNotMatch(renderRealAppMarkdown(report), /boundary is closed/)
})

test('read-only analysis neither executes project configuration nor writes checkout caches', async (t) => {
  const root = fixture(t, {
    'src/App.tsx': `import { View } from '@hozo/core'; export const App = () => <View className="p-2" />`,
    'package.json': JSON.stringify({ scripts: { build: 'throw sentinel' } }),
    'vite.config.js': `throw new Error('must not execute project config')`,
    'tailwind.config.js': `throw new Error('must not execute Tailwind config')`,
    'pnpm-lock.yaml': 'lockfileVersion: 9.0',
    'styles.css': '@config "./tailwind.config.js";',
    'fsmonitor.mjs': `import { writeFileSync } from 'node:fs'; writeFileSync('hook-executed', 'unexpected')`,
  })
  execFileSync('git', ['init', '--quiet'], { cwd: root })
  execFileSync('git', ['config', 'user.name', 'Hozo Test'], { cwd: root })
  execFileSync('git', ['config', 'user.email', 'test@hozo.invalid'], { cwd: root })
  execFileSync('git', ['add', '.'], { cwd: root })
  execFileSync('git', ['commit', '--quiet', '-m', 'fixture'], { cwd: root })
  const hook = `"${process.execPath.replaceAll('\\', '/')}" "${path.join(root, 'fsmonitor.mjs').replaceAll('\\', '/')}"`
  execFileSync('git', ['config', 'core.fsmonitor', hook], { cwd: root })
  const snapshot = () =>
    readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => [
        path.relative(root, path.join(entry.parentPath, entry.name)),
        readFileSync(path.join(entry.parentPath, entry.name)).toString('base64'),
      ])
      .sort(([a], [b]) => a.localeCompare(b))
  const before = snapshot()
  const report = await measureRealApp({ root, css: 'styles.css' })
  assert.equal(report.analysis.projectFacts.theme.status, 'unsupported')
  assert.match(renderRealAppMarkdown(report), /boundary is not fully assessed/)
  assert.deepEqual(snapshot(), before)
})

test('static CSS theme, preflight and trusted-source options reach canonical analysis', async (t) => {
  const root = fixture(t, {
    'src/App.tsx': `import { View } from '@acme/ui'; export const App = () => <View className="animate-wiggle bg-brand p-4" />`,
    'global.css': `@theme { --color-brand: #123456; --spacing: 3px; --animate-wiggle: wiggle 1s infinite; @keyframes wiggle { to { opacity: 0.5; } } }`,
  })
  const stdout = {
    isTTY: false,
    output: '',
    write(value) {
      this.output += value
    },
  }
  const report = await runCli(
    [root, '--css', 'global.css', '--preflight', 'false', '--primitive-source', '@acme/ui'],
    { stdout },
  )
  assert.equal(report.analysis.projectFacts.css.origin, 'explicit')
  assert.equal(report.analysis.projectFacts.theme.origin, 'explicit')
  assert.equal(report.analysis.projectFacts.theme.value.spacingPx, 3)
  assert.equal(report.analysis.projectFacts.theme.value.animations, 1)
  assert.equal(report.analysis.projectFacts.preflight.value, false)
  assert.equal(report.analysis.contextStatus, 'prepared')
  assert.equal(report.lowering.webComponents, 1)
  assert.equal(report.lowering.nativeComponents, 1)
  assert.ok(!report.findings.some((finding) => finding.message.includes('animate-wiggle')))
  assert.ok(report.analysis.primitiveSources.includes('react-native'))
  assert.ok(report.analysis.primitiveSources.includes('@acme/ui'))
  assert.equal(report.analysis.stylesheetInputs.length, 1)
  assert.match(report.toolchain.tailwindVersion, /^4\./)
  assert.match(report.toolchain.cssParserVersion, /^8\./)
  assert.match(report.analysis.stylesheetInputs[0].sha256, /^[a-f0-9]{64}$/)
  assert.ok(report.analysis.stageDurationMs['project:preparation'] >= 0)
  assert.equal(JSON.parse(stdout.output).analysis.contextStatus, 'prepared')
  const discovered = await measureRealApp({ root })
  assert.equal(discovered.analysis.projectFacts.css.origin, 'discovered')
  assert.equal(
    discovered.lowering.webComponents,
    0,
    'arbitrary modules are not trusted by discovery',
  )
  await assert.rejects(() => measureRealApp({ root, css: 'missing.css' }), AuditInputError)
  await assert.rejects(() => runCli([root, '--preflight', 'yes']), AuditInputError)
  await assert.rejects(() => measureRealApp({ root, primitiveSources: 'bad' }), AuditInputError)
})

test('broken discovered CSS is recorded as partial context rather than silently defaulted', async (t) => {
  const root = fixture(t, { 'src/App.tsx': simpleSource, 'global.css': '@theme {' })
  const report = await measureRealApp({ root })
  assert.equal(report.analysis.projectFacts.css.status, 'resolved')
  assert.equal(report.analysis.projectFacts.theme.status, 'invalid')
  assert.equal(report.analysis.contextStatus, 'partial')
  assert.equal(report.analysis.compilerAssumptions.theme, 'builtin')
  assert.match(renderRealAppMarkdown(report), /Partial context uses builtin tokens only as a probe/)
  assert.match(renderRealAppMarkdown(report), /boundary is not fully assessed/)
})

test('imported package CSS cannot execute a plugin and leaves the checkout byte-identical', async (t) => {
  const root = fixture(t, {
    'src/App.tsx': simpleSource,
    'global.css': '@import "@acme/tokens/theme.css";',
    'node_modules/@acme/tokens/package.json': JSON.stringify({
      name: '@acme/tokens',
      exports: { './theme.css': './theme.css' },
    }),
    'node_modules/@acme/tokens/theme.css': '@plugin "./plugin.cjs";',
    'node_modules/@acme/tokens/plugin.cjs': `require('node:fs').writeFileSync(require('node:path').resolve(__dirname, '../../../plugin-executed'), 'unexpected'); throw new Error('must not run')`,
  })
  const snapshot = () =>
    readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => [
        path.relative(root, path.join(entry.parentPath, entry.name)),
        readFileSync(path.join(entry.parentPath, entry.name), 'utf8'),
      ])
      .sort(([a], [b]) => a.localeCompare(b))
  const before = snapshot()
  const report = await measureRealApp({ root })
  assert.equal(report.analysis.projectFacts.theme.status, 'unsupported')
  assert.match(report.analysis.projectFacts.theme.reason, /theme\.css.*@plugin/)
  assert.equal(report.analysis.stylesheetInputs.length, 2)
  assert.equal(report.scope.authoredFiles, 1)
  assert.equal(report.scope.contextModules, 0)
  assert.deepEqual(snapshot(), before)
})
