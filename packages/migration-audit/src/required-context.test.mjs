import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { REQUIRED_CONTEXT_POLICY } from '@hozo/compiler/analysis'
import { compareReports, validateBaseline } from './comparison.mjs'
import { measureRealApp, renderRealAppMarkdown } from './index.mjs'
import { evaluateFailurePolicy } from './policy.mjs'

const plain = `// @stylexjs/stylex is a comment, not a requirement
  import {Canvas} from '@hozo/canvas'; export const App = () => <Canvas.Rect className="hover:fill-red-500" />`
const styled = `import sx from '@stylexjs/stylex'; import {View} from '@hozo/core'; import unused from 'missing-runtime'; import {styles} from '../tokens/sheet'; export const App = () => <View {...sx.props(styles.root)} />`
const sheet = `import sx from '@stylexjs/stylex'; export const styles = sx.create({root:{padding:8}})`
function fixture(t, files) {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-context-comparison-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const contents = { 'tsconfig.json': '{"extends":"not-installed-preset"}', ...files }
  for (const [file, source] of Object.entries(contents)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    writeFileSync(path.join(root, file), source)
  }
  return {
    root,
    contents,
    run: () => measureRealApp({ root, repository: 'fixture:required-context' }),
  }
}
const withComparison = (after, before) => ({ ...after, comparison: compareReports(after, before) })

test('two independent plain audits compare despite explicitly unresolved, unnecessary alias settings', async (t) => {
  const { root, contents, run } = fixture(t, { 'app/App.tsx': plain })
  const entries = readdirSync(root, { recursive: true })
  const before = await run()
  const after = await run()
  assert.equal(after.analysis.requiredContextPolicy, REQUIRED_CONTEXT_POLICY)
  assert.equal(after.analysis.projectFacts.aliases.status, 'unresolved')
  assert.equal(after.analysis.projectFacts.fonts.status, 'unresolved')
  assert.equal(after.files[0].targets.web.stylexContext.status, 'not-required')
  const observed = withComparison(after, before)
  assert.equal(observed.comparison.status, 'comparable')
  assert.equal(observed.comparison.findings.continued.length, 2)
  assert.deepEqual(observed.comparison.rewriteBoundaries.continued, ['app/App.tsx'])
  assert.equal(evaluateFailurePolicy(observed, 'new-errors').newErrors, 0)
  assert.deepEqual(readdirSync(root, { recursive: true }), entries)
  for (const [file, source] of Object.entries(contents))
    assert.equal(readFileSync(path.join(root, file), 'utf8'), source)
})

test('relative StyleX context is complete while unresolved unused, JSX-only and intrinsic imports stay in JSON', async (t) => {
  const { run } = fixture(t, { 'app/App.tsx': styled, 'tokens/sheet.ts': sheet })
  const before = await run()
  const after = await run()
  assert.equal(after.analysis.projectFacts.aliases.status, 'unresolved')
  assert.ok(
    after.analysis.graphResolutions.some(
      (edge) => edge.specifier === 'missing-runtime' && edge.status === 'unresolved',
    ),
  )
  assert.ok(after.analysis.projectFacts.stylexGraph.value.unresolvedImports > 0)
  const context = after.files[0].targets.web.stylexContext
  assert.equal(context.status, 'complete')
  assert.deepEqual(
    context.modules.map((entry) => entry.file),
    ['app/App.tsx', 'tokens/sheet.ts'],
  )
  assert.equal(context.edges.length, 1)
  assert.equal(context.edges[0].resolved, 'tokens/sheet.ts')
  assert.equal(after.lowering.webComponents, 1)
  assert.equal(after.lowering.nativeComponents, 1)
  assert.equal(withComparison(after, before).comparison.status, 'comparable')
  assert.equal(evaluateFailurePolicy(withComparison(after, before), 'new-errors').exitCode, 0)
  assert.match(renderRealAppMarkdown(after), /Required StyleX context/)
})

test('one required missing alias keeps its file unassessed without erasing comparable files', async (t) => {
  const { run } = fixture(t, {
    'app/Plain.tsx': plain,
    'app/Styled.tsx': styled.replace('../tokens/sheet', '@/sheet'),
    'tokens/sheet.ts': sheet,
  })
  const before = await run()
  const after = await run()
  const observed = withComparison(after, before)
  assert.equal(observed.comparison.status, 'partial')
  assert.equal(observed.comparison.findings.continued.length, 2)
  assert.deepEqual(observed.comparison.rewriteBoundaries.continued, ['app/Plain.tsx'])
  assert.ok(observed.comparison.files.notAssessed.some((entry) => entry.file === 'app/Styled.tsx'))
  const policy = evaluateFailurePolicy(observed, 'new-errors')
  assert.equal(policy.status, 'blocked')
  assert.equal(policy.newErrors, null)
  assert.match(renderRealAppMarkdown(after), /direct RN JSX boundary is not fully assessed/)
})

test('same-policy missing, inconsistent or unresolved target evidence is never inferred complete', async (t) => {
  const { run } = fixture(t, { 'app/App.tsx': styled, 'tokens/sheet.ts': sheet })
  const before = await run()
  const changes = [
    (r) => {
      delete r.files[0].targets.web.stylexContext
    },
    (r) => {
      r.files[0].targets.web.stylexContext.sourceSha256 = 'wrong-source'
    },
    (r) => {
      r.files[0].targets.web.stylexContext.platform = 'ios'
    },
    (r) => {
      r.files[0].targets.web.stylexContext.policy = 'future-policy'
    },
    (r) => {
      r.files[0].targets.web.stylexContext.status = 'unresolved'
    },
    (r) => {
      r.files[0].targets.web.stylexContext.modules = []
    },
    (r) => {
      r.files[0].targets.web.stylexContext.edges[0].status = 'unresolved'
    },
    (r) => {
      r.files[0].targets.web.stylexContext.issues.push('unknown required input')
    },
    (r) => {
      r.files[0].targets.web.stylexContext.modules[1].sha256 = 'wrong-dependency'
    },
    (r) => {
      r.analysis.graphResolutions = r.analysis.graphResolutions.filter(
        (edge) => edge.specifier !== '../tokens/sheet',
      )
    },
    (r) => {
      r.analysis.graphResolutions.find(
        (edge) => edge.platform === 'web' && edge.specifier === '../tokens/sheet',
      ).resolved = 'wrong-sheet.ts'
    },
    (r) => {
      r.analysis.projectFacts.theme.status = 'unresolved'
    },
    (r) => {
      r.analysis.projectFacts.css.status = 'unsupported'
    },
  ]
  for (const change of changes) {
    const after = structuredClone(before)
    change(after)
    const observed = withComparison(after, before)
    assert.equal(observed.comparison.status, 'partial')
    assert.equal(evaluateFailurePolicy(observed, 'new-errors').newErrors, null)
  }
})

test('edited authored dependencies leave their consumers unassessed, not silently resolved', async (t) => {
  const { root, run } = fixture(t, {
    'app/Plain.tsx': plain,
    'app/App.tsx': styled.replace('../tokens/sheet', './sheet'),
    'app/sheet.ts': sheet,
  })
  const before = await run()
  writeFileSync(path.join(root, 'app/sheet.ts'), sheet.replace('8', '16'))
  const observed = withComparison(await run(), before)
  assert.equal(observed.comparison.status, 'partial')
  assert.ok(
    observed.comparison.files.notAssessed.some(
      (entry) => entry.file === 'app/App.tsx' && /Required dependency inputs/.test(entry.reason),
    ),
  )
  assert.ok(observed.comparison.rewriteBoundaries.continued.includes('app/Plain.tsx'))
  assert.equal(evaluateFailurePolicy(observed, 'new-errors').newErrors, null)
})

test('legacy/unknown policies stay conservative and cannot inherit the new completeness contract', async (t) => {
  const { run } = fixture(t, { 'app/App.tsx': plain })
  const before = await run()
  const legacy = structuredClone(before)
  delete legacy.analysis.requiredContextPolicy
  for (const target of Object.values(legacy.files[0].targets)) delete target.stylexContext
  assert.equal(compareReports(before, legacy).status, 'not-comparable')
  assert.equal(compareReports(legacy, legacy).status, 'partial')
  const future = structuredClone(before)
  future.analysis.requiredContextPolicy = 'future-unknown-policy'
  assert.equal(compareReports(future, future).status, 'partial')
  const malformed = structuredClone(before)
  malformed.files[0].targets.web.stylexContext.edges = 'not-edges'
  assert.throws(() => validateBaseline(malformed), /StyleX context evidence/)
})

test('relocated checkouts compare using normalized context evidence; edited definitions do not', async (t) => {
  const files = { 'app/App.tsx': styled, 'tokens/sheet.ts': sheet }
  const a = fixture(t, files)
  const b = fixture(t, files)
  const before = await a.run()
  const after = await b.run()
  assert.equal(compareReports(after, before).status, 'comparable')
  writeFileSync(path.join(b.root, 'tokens/sheet.ts'), sheet.replace('8', '16'))
  const changed = await b.run()
  assert.equal(compareReports(changed, before).status, 'not-comparable')
  assert.equal(
    evaluateFailurePolicy(withComparison(changed, before), 'new-errors').status,
    'blocked',
  )
})

test('required Native platform gaps and parser recovery in definitions remain partial', async (t) => {
  for (const files of [
    { 'app/App.tsx': styled, 'tokens/sheet.web.ts': sheet },
    { 'app/App.tsx': styled, 'tokens/sheet.ts': `${sheet}; const broken = (` },
  ]) {
    const { run } = fixture(t, files)
    const before = await run()
    assert.equal(compareReports(await run(), before).status, 'partial')
  }
})

test('Native-only iOS files use their own prepared graph, regardless of the default Android probe', async (t) => {
  const { run } = fixture(t, { 'app/App.ios.tsx': styled, 'tokens/sheet.ios.ts': sheet })
  const before = await run()
  const native = before.files[0].targets.native
  assert.equal(native.platform, 'ios')
  assert.equal(native.stylexContext.platform, 'ios')
  assert.equal(native.stylexContext.status, 'complete')
  const comparison = compareReports(await run(), before)
  assert.equal(comparison.status, 'comparable')
  assert.deepEqual(comparison.rewriteBoundaries.notApplicable, ['app/App.ios.tsx'])
})
