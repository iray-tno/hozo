import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { analyzeModule, prepareAnalysisStylex } from './analysis.ts'
import { createCompiler } from './index.ts'

const sheet = `import sx from '@stylexjs/stylex'; export const styles = sx.create({root:{padding:8}})`
const consumer = `import sx from '@stylexjs/stylex'; import {View} from '@hozo/core'; import {styles} from './barrel'; export const App = () => <View {...sx.props(styles.root)} />`
function prepare(t: test.TestContext, source = consumer, extras: Record<string, string> = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-required-context-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const files = {
    'App.tsx': source,
    'barrel.ts': `export {styles} from './sheet'`,
    'sheet.web.ts': sheet,
    'sheet.ios.ts': sheet,
    'sheet.android.ts': sheet,
    ...extras,
  }
  for (const [file, contents] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    writeFileSync(path.join(root, file), contents)
  }
  const file = path.join(root, 'App.tsx')
  const project = prepareAnalysisStylex(
    root,
    [{ file, source }],
    Object.keys(files).map((file) => path.join(root, file)),
  )
  const run = (input = source, platform: 'ios' | 'android' = 'android') =>
    analyzeModule(input, {
      compiler: createCompiler(),
      root,
      file,
      targets: ['web', 'native'],
      nativePlatform: platform,
      stylexContexts: project.graphs,
      stylexRegistries: project.registries,
      stylexContextAnalysis: project.contextFor,
    })
  return { root, file, project, run }
}

test('unresolved JSX/intrinsic imports remain inventoried without blocking required relative StyleX context', (t) => {
  const { project, run } = prepare(t, consumer, { 'tsconfig.json': '{"extends":"missing-preset"}' })
  assert.equal(project.aliases.status, 'unresolved')
  assert.equal(project.resolutions.filter((edge) => edge.status === 'unresolved').length, 9)
  const result = run()
  for (const target of Object.values(result.targets)) {
    assert.equal(target.stylexContext?.status, 'complete')
    assert.equal(target.stylexContext.modules.length, 3)
    assert.equal(target.stylexContext.edges.length, 2)
    assert.deepEqual(target.stylexContext.issues, [])
  }
  assert.doesNotMatch(result.targets.web!.code!, /sx\.props/)
  assert.match(result.targets.web!.code!, /hozo-/)
  assert.ok(
    run(consumer, 'ios').targets.native?.stylexContext?.modules.some(({ file }) =>
      file.endsWith('sheet.ios.ts'),
    ),
  )
})

test('no StyleX requirement comes from actual bindings, not package mentions or missing summaries', () => {
  const source = `// @stylexjs/stylex is not an import
    import type {StyleXStyles} from '@stylexjs/stylex'; import {View} from '@hozo/core'; export const App = () => <View />`
  const result = analyzeModule(source, {
    compiler: createCompiler(),
    file: '/App.tsx',
    root: '/',
    targets: ['web', 'native'],
  })
  for (const target of Object.values(result.targets)) {
    assert.equal(target.stylexContext?.status, 'not-required')
    assert.equal(target.stylexContext.modules.length, 0)
  }
})

test('used aliases and conservative unrelated value imports stay unresolved when missing', (t) => {
  const alias = prepare(t, consumer.replace('./barrel', '@/barrel'), {
    'tsconfig.json': '{"extends":"missing-preset"}',
  })
  assert.equal(alias.run().targets.web?.stylexContext?.status, 'unresolved')
  const broader = prepare(
    t,
    consumer.replace(
      'export const App',
      `import log from 'logger'; log('runtime'); export const App`,
    ),
  )
  assert.equal(broader.run().targets.web?.stylexContext?.status, 'unresolved')
  assert.ok(
    broader.run().targets.web?.stylexContext?.edges.some((edge) => edge.specifier === 'logger'),
  )
})

test('missing prepared evidence and changed source/definitions cannot become complete', (t) => {
  const { file, project, run } = prepare(t)
  assert.equal(run(`${consumer}\n// edited`).targets.web?.stylexContext?.status, 'unresolved')
  const missing = analyzeModule(consumer, {
    compiler: createCompiler(),
    file,
    root: path.dirname(file),
    targets: ['web'],
  })
  assert.equal(missing.targets.web?.stylexContext?.status, 'unresolved')
  const definition = path.join(path.dirname(file), 'sheet.web.ts')
  project.graphs.web.scanFile(definition, sheet.replace('8', '16'), 1)
  assert.equal(run().targets.web?.stylexContext?.status, 'unresolved')
})

test('a missing/ambiguous transitive barrel edge stays required; cycles terminate', (t) => {
  const missing = prepare(t, consumer, { 'barrel.ts': `export {styles} from './absent'` })
  assert.equal(missing.run().targets.web?.stylexContext?.status, 'unresolved')
  const ambiguous = prepare(t, consumer, { 'sheet.web.js': sheet })
  assert.equal(ambiguous.run().targets.web?.stylexContext?.status, 'unresolved')
  const cycle = prepare(t, consumer, {
    'barrel.ts': `export {styles} from './sheet'; export * from './cycle'`,
    'cycle.ts': `export * from './barrel'`,
  })
  assert.equal(cycle.run().targets.web?.stylexContext?.status, 'complete')
  assert.equal(cycle.run().targets.web?.stylexContext?.modules.length, 4)
})

test('changed resolver links cannot reuse a prepared completeness verdict', (t) => {
  const { file, project, run } = prepare(t)
  project.graphs.web.setResolvedBindings(file, [])
  assert.equal(run().targets.web?.stylexContext?.status, 'unresolved')
  assert.equal(run().targets.native?.stylexContext?.status, 'complete')
})

test('provider failures enter canonical analysis failures rather than escaping the pipeline', () => {
  const result = analyzeModule(consumer, {
    compiler: createCompiler(),
    file: '/App.tsx',
    root: '/',
    targets: ['web'],
    stylexContextAnalysis: () => {
      throw new Error('bad prepared evidence')
    },
  })
  assert.ok(
    result.stages.some((stage) => stage.stage === 'required-context' && stage.status === 'failed'),
  )
  assert.ok(
    result.findings.some(
      (finding) => finding.code === 'ANALYSIS_FAILED' && finding.stage === 'required-context',
    ),
  )
})
