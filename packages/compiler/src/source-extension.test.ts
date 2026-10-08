import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { analyzeModule } from './analysis.ts'
import { createCompiler, summarizeStylexModule } from './index.ts'
import { StylexModuleCache } from './stylex-project.ts'

const compiler = createCompiler()
const generic = 'export const identity = async <T>(value: T): Promise<T> => value'

test('NAPI and canonical analysis select TS grammar for source and unchanged Web output', () => {
  assert.deepEqual(
    compiler.compileNativeModule(generic, undefined, 'generic.ts').syntaxDiagnostics,
    [],
  )
  assert.ok(compiler.compileNativeModule(generic).syntaxDiagnostics.length > 0)
  assert.ok(
    compiler.compileNativeModule(generic, undefined, 'generic.tsx').syntaxDiagnostics.length > 0,
  )
  const result = analyzeModule(generic, {
    compiler,
    file: 'generic.ts',
    root: '',
    targets: ['web', 'native'],
  })
  assert.deepEqual(result.findings, [])
  assert.equal(result.targets.web?.status, 'completed')
  assert.equal(result.targets.native?.status, 'completed')
  assert.equal(result.targets.web?.integrationEligibility, 'runtime-imports-only')
  assert.equal(result.targets.native?.integrationEligibility, 'compiler-probe-only')
  assert.equal(result.targets.web?.code, generic)
  assert.deepEqual(result.targets.web?.directReactNativeJsxResidue, [])
})

test('JavaScript JSX remains inventory, not semantic integration support or TypeScript', () => {
  const source = `import { View } from 'react-native'; export const Card = () => <View />`
  for (const file of ['Card.js', 'Card.jsx', 'Card.mjs']) {
    const result = analyzeModule(source, { compiler, file, root: '', targets: ['web', 'native'] })
    assert.equal(result.targets.web?.status, 'completed', file)
    assert.equal(result.targets.web?.code, source, file)
    assert.deepEqual(result.targets.web?.directReactNativeJsxResidue, ['View'], file)
    assert.equal(result.targets.web?.integrationEligibility, 'runtime-imports-only')
    assert.equal(result.targets.native?.integrationEligibility, 'compiler-probe-only')
    assert.ok(
      compiler.compileNativeModule('export const value: number = 1', undefined, file)
        .syntaxDiagnostics.length > 0,
    )
  }
})

test('extension-aware errors retain authored UTF-16 positions and cannot close a boundary', () => {
  for (const file of ['Invalid.ts', 'Invalid.tsx', 'Invalid.mts', 'Invalid.js']) {
    const source = '// 😀 日本語\r\nexport const value = ;'
    const module = compiler.compileNativeModule(source, undefined, file)
    const diagnostic = module.syntaxDiagnostics[0]!
    assert.equal(diagnostic.spanStart, source.lastIndexOf(';'), file)
    const result = analyzeModule(source, { compiler, file, root: '', targets: ['web', 'native'] })
    const syntax = result.findings.find(({ code }) => code === 'SOURCE_SYNTAX_ERROR')!
    assert.equal(syntax.severity, 'error')
    assert.equal(syntax.location.status, 'authored')
    if (syntax.location.status === 'authored') {
      assert.equal(syntax.location.line, 2)
      assert.equal(syntax.location.column, 22)
    }
    assert.equal(result.targets.web?.status, 'failed')
    assert.equal(result.targets.web?.directReactNativeJsxResidue, undefined)
  }
})

test('StyleX summaries and registry use the defining filename, not an opaque module ID', () => {
  const source = `${generic}; import * as stylex from '@stylexjs/stylex'; export const styles = stylex.create({ root: { padding: 37 } })`
  assert.equal(summarizeStylexModule(source, 'styles.ts').exports[0]?.exported, 'styles')
  const entry = {
    id: 'opaque:sheet',
    contentHash: 'same-bytes',
    source,
    sourceFile: 'styles.ts',
    links: [],
  }
  compiler.setStylexModules([entry])
  const consumer = `import * as stylex from '@stylexjs/stylex'; import { View } from '@hozo/core'; import { styles } from 'sheet'; export const Card = () => <View {...stylex.props(styles.root)} />`
  const bindings = [{ specifier: 'sheet', moduleId: entry.id }]
  assert.match(compiler.compile(consumer, bindings)[0]!.css, /padding-top: 37px/)
  assert.match(compiler.compileNative(consumer, bindings)[0]!.styles, /paddingTop: 37/)
  // Grammar is part of registry identity even when ID/hash/links did not change.
  compiler.setStylexModules([{ ...entry, sourceFile: 'styles.tsx' }])
  assert.doesNotMatch(compiler.compile(consumer, bindings)[0]!.css, /padding-top: 37px/)
  compiler.setStylexModules([entry])
  assert.match(compiler.compile(consumer, bindings)[0]!.css, /padding-top: 37px/)
})

test('persistent TSX-era summaries cannot make unchanged TS source look current', (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-grammar-cache-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const file = path.join(root, 'styles.ts')
  const cacheFile = path.join(root, 'stylex.json')
  const source = `${generic}; import * as stylex from '@stylexjs/stylex'; export const styles = stylex.create({ root: { padding: 41 } })`
  writeFileSync(file, source)
  writeFileSync(
    cacheFile,
    JSON.stringify({
      version: 3,
      files: {
        [file]: {
          modifiedMs: 1,
          contentHash: 'old',
          summary: { exports: [], imports: [], reexports: [] },
        },
      },
    }),
  )
  const cache = new StylexModuleCache(cacheFile)
  assert.equal(cache.isCurrent(file, 1), false)
  assert.equal(cache.scanFile(file, source, 1), true)
  assert.equal(cache.modules()[0]?.summary.exports[0]?.exported, 'styles')
  assert.equal(cache.moduleSources()[0]?.sourceFile, file)
  cache.persist()
  assert.equal(JSON.parse(readFileSync(cacheFile, 'utf8')).version, 4)
  assert.equal(new StylexModuleCache(cacheFile).isCurrent(file, 1), true)
})
