import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { analyzeModule, discoverAnalysisSources, prepareAnalysisProject } from './analysis.ts'

const card = `import * as stylex from '@stylexjs/stylex'; import { View } from '@hozo/core'; import { styles } from '@/barrel'; export const Card = () => <View {...stylex.props(styles.root)} />`
const sheet = (padding: number) =>
  `export const identity = <T>(value: T) => value; import * as stylex from '@stylexjs/stylex'; export const styles = stylex.create({ root: { padding: ${padding} } })`
function fixture(t: test.TestContext, files: Record<string, string>) {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-analysis-graph-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const [file, source] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    writeFileSync(path.join(root, file), source)
  }
  return root
}
async function prepare(root: string) {
  const selection = discoverAnalysisSources(root, { source: 'app' })
  return prepareAnalysisProject(
    {
      root,
      contextCandidates: selection.contextCandidates,
      authoredSources: selection.files.map((file) => ({
        file,
        source: readFileSync(file, 'utf8'),
      })),
    },
    async () => ({
      css: { status: 'absent', reason: 'none' },
      theme: { status: 'absent', reason: 'none' },
      stylesheets: [],
    }),
  )
}

test('static aliases, reexports and platform definitions really lower without polluting authored counts', async (t) => {
  const root = fixture(t, {
    'app/Card.tsx': card,
    'tsconfig.json': `{// JSONC is static, not config execution\n "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["tokens/*"] } }, }`,
    'tokens/barrel.ts': `export { styles } from './sheet'`,
    'tokens/sheet.ts': sheet(1),
    'tokens/sheet.web.ts': sheet(11),
    'tokens/sheet.native.ts': sheet(22),
    'tokens/sheet.ios.ts': sheet(33),
    'tokens/sheet.android.ts': sheet(44),
  })
  const context = await prepare(root)
  assert.equal(context.projectFacts.aliases.status, 'resolved')
  assert.equal(
    context.stylex.contextSources.length,
    4,
    'barrel + three selected platforms only, not generic/native fallbacks',
  )
  const file = path.join(root, 'app/Card.tsx')
  for (const [platform, padding] of [
    ['web', 11],
    ['ios', 33],
    ['android', 44],
  ] as const) {
    const graph = context.stylex.graphs[platform]
    context.compiler.setStylexModules(graph.moduleSources())
    const bindings = graph.bindingsFor(file)
    if (platform === 'web')
      assert.match(
        context.compiler.compile(card, bindings)[0]!.css,
        new RegExp(`padding-top: ${padding}px`),
      )
    else
      assert.match(
        context.compiler.compileNative(card, bindings)[0]!.styles,
        new RegExp(`paddingTop: ${padding}`),
      )
  }
  for (const platform of ['ios', 'android', 'ios'] as const) {
    const result = analyzeModule(card, {
      file,
      root,
      compiler: context.compiler,
      stylexContexts: context.stylex.graphs,
      targets: ['web', 'native'],
      nativePlatform: platform,
    })
    assert.doesNotMatch(result.targets.web!.code!, /stylex\.props/)
    assert.equal(result.targets.native!.platform, platform)
    assert.ok(!result.findings.some(({ code }) => /STYLEX.*UNRESOLVED/.test(code)))
  }
  writeFileSync(path.join(root, 'tokens/sheet.web.ts'), sheet(55))
  const fresh = await prepare(root)
  const graph = fresh.stylex.graphs.web
  fresh.compiler.setStylexModules(graph.moduleSources())
  assert.match(fresh.compiler.compile(card, graph.bindingsFor(file))[0]!.css, /padding-top: 55px/)
  assert.notEqual(
    fresh.stylex.contextSources.find(({ file }) => file.endsWith('sheet.web.ts'))!.sha256,
    context.stylex.contextSources.find(({ file }) => file.endsWith('sheet.web.ts'))!.sha256,
  )
})

test('local config inheritance, alias precedence, index and ESM spellings are static facts', async (t) => {
  const root = fixture(t, {
    'app/Card.tsx': card.replace('@/barrel', '@/barrel.js'),
    'tsconfig.json':
      '{"extends":"./config/base", "compilerOptions":{"paths":{"@/*":["tokens/*"],"@/barrel.js":["tokens/entry/index.ts"]}}}',
    'config/base.json': '{"compilerOptions":{"baseUrl":".."}}',
    'tokens/entry/index.ts': `export { styles } from '../sheet.js'`,
    'tokens/sheet.ts': sheet(77),
  })
  const context = await prepare(root)
  assert.equal(context.stylex.configurationInputs.length, 2)
  const file = path.join(root, 'app/Card.tsx')
  const result = analyzeModule(readFileSync(file, 'utf8'), {
    file,
    root,
    compiler: context.compiler,
    stylexContexts: context.stylex.graphs,
    targets: ['web'],
  })
  assert.doesNotMatch(result.targets.web!.code!, /stylex\.props/)
})

test('unsupported configs and unresolved/cyclic graph edges do not get guessed', async (t) => {
  for (const config of [
    '{"extends":"@app/executable-config"}',
    '{ broken',
    '{"extends":"./tsconfig"}',
    '{"compilerOptions":null}',
    '{"compilerOptions":{"paths":null}}',
  ]) {
    const root = fixture(t, {
      'app/Card.tsx': card,
      'tsconfig.json': config,
      'tokens/barrel.ts': sheet(99),
    })
    const context = await prepare(root)
    assert.ok(['unsupported', 'invalid'].includes(context.projectFacts.aliases.status))
    assert.ok(
      context.stylex.resolutions.some(
        ({ specifier, status }) => specifier === '@/barrel' && status === 'unresolved',
      ),
    )
    assert.equal(context.stylex.graphs.web.bindingsFor(path.join(root, 'app/Card.tsx')).length, 0)
  }
  const root = fixture(t, {
    'app/Card.tsx': card.replace('@/barrel', '../tokens/a'),
    'tokens/a.ts': `export * from './b'`,
    'tokens/b.ts': `export * from './a'`,
  })
  const context = await prepare(root)
  assert.equal(context.stylex.graphs.web.size, 0)
  assert.equal(context.stylex.contextSources.length, 2)
})

test('ambiguous extension choices are unresolved instead of selecting another bundler policy', async (t) => {
  const root = fixture(t, {
    'app/Card.tsx': card.replace('@/barrel', '../tokens/sheet'),
    'tokens/sheet.ts': sheet(8),
    'tokens/sheet.tsx': sheet(9),
  })
  const context = await prepare(root)
  assert.equal(context.stylex.contextSources.length, 0)
  assert.ok(
    context.stylex.resolutions.some(
      ({ specifier, status }) => specifier === '../tokens/sheet' && status === 'unresolved',
    ),
  )
  const file = path.join(root, 'app/Card.tsx')
  assert.equal(context.stylex.graphs.web.bindingsFor(file).length, 0)
})

test('paths without baseUrl originate in the declaring config, not an empty inherited config', async (t) => {
  const root = fixture(t, {
    'app/Card.tsx': card,
    'tsconfig.json':
      '{"extends":"./config/base.common","compilerOptions":{"paths":{"@/*":["tokens/*"]}}}',
    'config/base.common.json': '{}',
    'tokens/barrel.ts': sheet(88),
  })
  const context = await prepare(root)
  const file = path.join(root, 'app/Card.tsx')
  const graph = context.stylex.graphs.web
  context.compiler.setStylexModules(context.stylex.registries.web)
  assert.match(context.compiler.compile(card, graph.bindingsFor(file))[0]!.css, /padding-top: 88px/)
})

test('a config directory link cannot turn a local extends into an external read', async (t) => {
  const outside = fixture(t, { 'base.json': '{"compilerOptions":{"paths":{"@/*":["secret/*"]}}}' })
  const root = fixture(t, { 'app/Card.tsx': card, 'tsconfig.json': '{"extends":"./linked/base"}' })
  symlinkSync(outside, path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir')
  const context = await prepare(root)
  assert.equal(context.projectFacts.aliases.status, 'unsupported')
  assert.equal(context.stylex.configurationInputs.length, 1, 'external bytes were not loaded')
})
