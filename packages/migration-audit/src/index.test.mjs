import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { measureRealApp, renderRealAppMarkdown, runCli } from './index.mjs'

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
    const loweredBy = report.samples.loweredBy ?? []
    assert.equal(loweredBy.length, report.lowering.filesLowered)
    assert.ok(loweredBy.some((entry) => /^Shared\.tsx: .*react-native/.test(entry)))
    // A file that lowered with nothing recognised in it would read as
    // `(none)`, which is that contradiction with somewhere to go and look.
    // These all have a reason, so none of them say it.
    assert.ok(!loweredBy.some((entry) => entry.endsWith('(none)')))

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
    assert.equal(report.authoredSignals.filesUsingAlfAtoms, 0)
    assert.equal(report.authoredSignals.filesWithClassName, 2)
    // `flex` alone, not `flex-col`: one file, not two.
    assert.equal(report.authoredSignals.filesWithBareFlexClassName, 1)
    // Nothing lowers, and that is the point.
    //
    // A tag is lowered only when its binding was imported from one of
    // `DEFAULT_PRIMITIVE_SOURCES` -- the seven `@hozo/*` packages and
    // `react-native`. `parse` builds its primitive aliases from the import
    // record against that list, so a `<div className="...">` in an app that
    // imports none of them is carried verbatim.
    //
    // Which is what makes the report #457 was filed about contradictory: it
    // showed six lowered files and twenty-four components for a corpus whose
    // authored surface imported nothing lowerable. This pins the floor, so
    // that the contradiction stays visible rather than being explained away.
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
    assert.match(readFileSync(out, 'utf8'), /"schemaVersion": 1/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
