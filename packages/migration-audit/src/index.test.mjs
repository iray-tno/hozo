import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { AuditInputError, measureRealApp, renderRealAppMarkdown, runCli } from './index.mjs'

test('measures platform-aware residue after DOM style arrays are normalized', () => {
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

    const report = measureRealApp({ root, source: 'src', name: 'fixture' })
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
test('a className-only corpus with no React Native lowers nothing', () => {
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

    const report = measureRealApp({ root, source: 'src', name: 'dom-only' })
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
test('a locally declared component named like a primitive does not lower', () => {
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

    const report = measureRealApp({ root, source: 'src', name: 'local-primitive' })
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
test('the CLI accepts the checkout as a positional argument', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-migration-audit-cli-'))
  try {
    const source = path.join(root, 'src')
    mkdirSync(source)
    writeFileSync(path.join(source, 'App.tsx'), 'export function App() { return <div /> }\n')
    const out = path.join(root, 'audit.json')
    const report = runCli([root, '--output', out])
    assert.equal(report.corpus.name, path.basename(root))
    assert.equal(report.scope.tsxFiles, 1)
    assert.match(readFileSync(out, 'utf8'), /"schemaVersion": 2/)
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

test('discovers app without src and scans both when src and app coexist', (t) => {
  const appRoot = fixture(t, { 'app/index.tsx': simpleSource })
  const app = measureRealApp({ root: appRoot })
  assert.deepEqual(app.corpus.sourceDirectories, ['app'])
  assert.equal(app.scope.tsxFiles, 1)
  const bothRoot = fixture(t, { 'src/Shared.tsx': simpleSource, 'app/index.tsx': simpleSource })
  const both = measureRealApp({ root: bothRoot })
  assert.deepEqual(both.corpus.sourceDirectories, ['src', 'app'])
  assert.equal(both.scope.tsxFiles, 2)
  const markdown = renderRealAppMarkdown(both)
  assert.match(markdown, /`src\/\*\*\/\*\.tsx`, `app\/\*\*\/\*\.tsx`/)
  assert.match(markdown, /--source "src" --source "app"/)
})

test('an empty src does not hide app or root-level TSX', (t) => {
  const appRoot = fixture(t, {
    'src/utility.ts': 'export const x = 1',
    'app/index.tsx': simpleSource,
  })
  assert.deepEqual(measureRealApp({ root: appRoot }).corpus.sourceDirectories, ['app'])
  const root = fixture(t, { 'src/utility.ts': 'export const x = 1', 'App.tsx': simpleSource })
  assert.deepEqual(measureRealApp({ root }).corpus.sourceDirectories, ['.'])
})

test('root fallback excludes dependencies and generated output', (t) => {
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
  const report = measureRealApp({ root })
  assert.equal(report.scope.tsxFiles, 2)
  assert.equal(report.lowering.parseOrCompileFailures, 0)
})

test('root discovery does not follow a directory symlink back into the checkout', (t) => {
  const root = fixture(t, { 'App.tsx': simpleSource })
  symlinkSync(root, path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir')
  assert.equal(measureRealApp({ root }).scope.tsxFiles, 1)
})

test('explicit sources override discovery and overlapping sources are deduplicated', (t) => {
  const root = fixture(t, {
    'src/App.tsx': simpleSource,
    'app/index.tsx': simpleSource,
    'custom/Card.tsx': simpleSource,
  })
  const report = measureRealApp({ root, source: 'custom' })
  assert.deepEqual(report.corpus.sourceDirectories, ['custom'])
  assert.equal(report.scope.tsxFiles, 1)
  const stdout = {
    isTTY: false,
    output: '',
    write(value) {
      this.output += value
    },
  }
  runCli([root, '--source', '.', '--source', 'src'], { stdout })
  assert.equal(JSON.parse(stdout.output).scope.tsxFiles, 3)
})

test('no TSX, missing source, source file and missing checkout are input errors', (t) => {
  const root = fixture(t, { 'app/index.jsx': simpleSource })
  assert.throws(() => measureRealApp({ root }), { name: 'Error', message: /No TSX.*--source/ })
  for (const source of ['missing', 'app/index.jsx']) {
    assert.throws(() => measureRealApp({ root, source }), AuditInputError)
  }
  assert.throws(() => measureRealApp({ root: path.join(root, 'missing') }), AuditInputError)
  const cli = fileURLToPath(new URL('./cli.mjs', import.meta.url))
  const result = spawnSync(process.execPath, [cli, root], { encoding: 'utf8' })
  assert.equal(result.status, 1)
  assert.equal(result.stdout, '')
  assert.match(result.stderr, /^hozo-migration-audit: No TSX.*--source[^\r\n]*\r?\n$/)
  assert.doesNotMatch(result.stderr, /ENOENT|at walk|node:fs/)
})

test('terminal output is Markdown, pipes are JSON, and explicit formats win', (t) => {
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
    runCli([root, ...args], { stdout })
    if (format === 'json') assert.equal(JSON.parse(stdout.output).schemaVersion, 2)
    else assert.match(stdout.output, /^# Real-app measurement:/)
  }
  const md = path.join(root, 'report.md')
  const stdout = { isTTY: false, write() {} }
  runCli([root, '--output', md], { stdout })
  assert.match(readFileSync(md, 'utf8'), /^# Real-app measurement:/)
  runCli([root, '--output', md, '--format', 'json'], { stdout })
  assert.equal(JSON.parse(readFileSync(md, 'utf8')).schemaVersion, 2)
})

test('help succeeds without a checkout and argument errors have no stack trace', () => {
  const cli = fileURLToPath(new URL('./cli.mjs', import.meta.url))
  const help = spawnSync(process.execPath, [cli, '--help'], { encoding: 'utf8' })
  assert.equal(help.status, 0)
  assert.match(help.stdout, /Only \.tsx files/)
  assert.equal(help.stderr, '')
  for (const args of [[], ['--source'], ['.', '--unknown', 'x']]) {
    const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' })
    assert.equal(result.status, 1)
    assert.equal(result.stderr.trim().split(/\r?\n/).length, 1)
    assert.match(result.stderr, /^hozo-migration-audit:/)
  }
})

test('Bluesky-style corpus signals are opt-in and do not leak into generic output', (t) => {
  const root = fixture(t, {
    'src/App.tsx':
      'const atoms = { box: {} }; export function App() { return <div style={atoms.box} /> }',
  })
  const generic = measureRealApp({ root })
  assert.equal(generic.corpusSignals, undefined)
  assert.equal(Object.hasOwn(generic.authoredSignals, 'filesUsingAlfAtoms'), false)
  assert.doesNotMatch(renderRealAppMarkdown(generic), /ALF|filesUsingAlfAtoms/)
  const report = measureRealApp({
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
  assert.throws(
    () => measureRealApp({ root, expectedCommit: 'not-the-pinned-commit' }),
    AuditInputError,
  )
  report.lowering.parseOrCompileFailures = 1
  assert.match(renderRealAppMarkdown(report), /The corpus has parse or compile failures/)
  assert.doesNotMatch(renderRealAppMarkdown(report), /The corpus parses cleanly/)
})
