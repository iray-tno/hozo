import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { transformSync } from 'esbuild'
import { createClassResolver } from '../../engine/src/class-resolver.ts'
import {
  createCompiler,
  nativeClassReport,
  nativeClassVerdicts,
  openCandidateCache,
} from './index.ts'

const code = 'TAILWIND_IMPORTANT_NOT_LOWERED'
const classes = ['p-2!', '!p-2', 'hover:p-2!', 'hover:!p-2', 'bg-red-500!', 'w-[32px]!']

test('known important syntax is reported once by Web and Native instead of lost or parsed as a color', () => {
  const compiler = createCompiler()
  for (const name of classes) {
    const source = `// 🙂
      import {View} from '@hozo/core'; const el=<View className="${name}"/>`
    for (const result of [compiler.compile(source)[0]!, compiler.compileNative(source)[0]!]) {
      const found = result.diagnostics.filter((diagnostic) => diagnostic.code === code)
      assert.equal(found.length, 1, `${name}: ${JSON.stringify(result.diagnostics)}`)
      assert.equal(found[0]!.severity, 'warning')
      assert.ok(source.slice(found[0]!.spanStart, found[0]!.spanEnd).includes(name))
      assert.doesNotMatch(result.jsx, /hozoStyles/)
    }
    assert.doesNotMatch(
      compiler.compile(source)[0]!.css,
      /padding-(top|right|bottom|left):|background-color:|width: 32px/,
    )
  }
})

test('secondary props and known dynamic branches share one warning without reevaluating authored guards', () => {
  const compiler = createCompiler()
  const source = `import {Avatar,Pressable,cx} from '@hozo/core';
    const el=<Pressable className={cx('bg-red-500!', check() && 'bg-red-500!', extra)}>
      <Avatar fallbackClassName="hover:!p-2"/>
    </Pressable>`
  const web = compiler.compile(source)
  const native = compiler.compileNativeModule(source)
  assert.equal(
    web.flatMap((entry) => entry.diagnostics).filter((diagnostic) => diagnostic.code === code)
      .length,
    2,
  )
  const nativeWarnings = [
    ...native.diagnostics,
    ...native.components.flatMap((entry) => entry.diagnostics),
  ]
  assert.equal(nativeWarnings.filter((diagnostic) => diagnostic.code === code).length, 2)
  assert.equal(
    nativeWarnings.filter((diagnostic) => diagnostic.code === 'CLASS_NOT_DRAWN_ON_NATIVE').length,
    0,
  )
})

test('the actual generated fallback warns once, applies no normal substitute and preserves ordinary styles', (t) => {
  const cache = openCandidateCache()
  cache.scanFile(
    'classes.ts',
    `export const classes=${JSON.stringify(`${classes.join(' ')} p-4`)}`,
    1,
  )
  assert.deepEqual(cache.candidates(), [...classes, 'p-4'].sort())
  const plain = openCandidateCache()
  plain.scanFile('plain', `export const classes='p-4'`, 1)
  assert.equal(cache.renderCss(), plain.renderCss())
  const module = { exports: {} }
  new Function(
    'require',
    'module',
    transformSync(cache.renderNativeModule(), { format: 'cjs' }).code,
  )(() => ({ createClassResolver }), module)
  const resolve = (module.exports as { hozoClasses: ReturnType<typeof createClassResolver> })
    .hozoClasses
  const warnings: string[] = []
  const warn = console.warn
  console.warn = (message) => warnings.push(message)
  t.after(() => {
    console.warn = warn
  })
  for (const name of classes) {
    assert.deepEqual(resolve(name, { hovered: true }), [])
    assert.deepEqual(resolve(name, { hovered: false }), [])
  }
  assert.equal(warnings.length, classes.length)
  assert.ok(
    warnings.every((warning) => warning.includes('not lowered') && warning.includes('precedence')),
  )
  assert.equal(Object.assign({}, ...resolve('p-4')).paddingTop, 16)
  const verdicts = nativeClassVerdicts(classes)
  assert.ok(verdicts.every((verdict) => verdict?.kind === 'missing'))
  const report = nativeClassReport(
    `import {View} from '@hozo/core';const el=<View className="p-2!"/>`,
  )
  assert.equal(report.length, 1)
  assert.equal(report[0]!.kind, 'missing')
})

test('syntax-like punctuation and foreign component contracts do not acquire the important diagnostic', () => {
  const compiler = createCompiler()
  const source = `import {View as Foreign} from 'foreign';
    import {View} from '@hozo/core';
    const el=<View className="p-2 content-['!'] bg-[url(a!)] custom! !hover:p-2"><Foreign className="p-2!"/></View>`
  assert.ok(
    compiler
      .compile(source)
      .flatMap((entry) => entry.diagnostics)
      .every((entry) => entry.code !== code),
  )
})

test('pre-important scan snapshots and exported receipts are rejected even with identical mtimes', (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-important-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const file = path.join(root, 'candidates.json')
  const cache = openCandidateCache(file)
  cache.scanFile('entry', `export const classes='p-2!'`, 10)
  cache.persist()
  const record = JSON.parse(cache.exportFile('entry')!)
  assert.equal(record.scanVersion, 6)
  record.scanVersion = 5
  const target = openCandidateCache()
  assert.throws(
    () => target.importFile('entry', JSON.stringify(record), 10),
    /Invalid cached candidate/,
  )
  const snapshot = JSON.parse(readFileSync(file, 'utf8'))
  snapshot.version = 5
  snapshot.files.entry.class_names = []
  writeFileSync(file, JSON.stringify(snapshot))
  const restored = openCandidateCache(file)
  assert.equal(restored.isCurrent('entry', 10), false)
  restored.scanFile('entry', `export const classes='p-2!'`, 10)
  assert.deepEqual(restored.candidates(), ['p-2!'])
})
