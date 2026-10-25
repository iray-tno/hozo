import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test, { type TestContext } from 'node:test'
import { createCompiler } from '@hozo/compiler'
import { TailwindProjectSession } from '@hozo/compiler/project'
import { DEFAULT_CSS_FILES } from './project.ts'
import { loadProjectTailwindSnapshot } from './project-snapshot.ts'
import { ExecutableStylesheetError } from './static-css.ts'
import { loadTheme, prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

function fixture(t: TestContext) {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-tailwind-snapshot-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const entry = path.join(root, 'global.css')
  const imported = path.join(root, 'tokens.css')
  const palette = path.join(root, 'palette.css')
  const css = '@import "tailwindcss";\n@import "./tokens.css";'
  writeFileSync(entry, css)
  writeFileSync(imported, '@import "./palette.css"; @theme { --spacing: 0.25rem; }')
  writeFileSync(palette, '@theme { --color-brand: #123456; }')
  return { root, entry, imported, palette, css }
}

const source = `import {View, Text} from '@hozo/core';
export const A=()=> <View className="p-2 hover:p-4"><Text className="text-brand">Hello</Text></View>`
const names = ['p-2', 'hover:p-4', 'text-brand', 'notautility']

test('one immutable project snapshot matches independent theme/order loaders and full Web/Native output', async (t) => {
  const { root, entry, imported, palette, css } = fixture(t)
  const snapshot = await loadProjectTailwindSnapshot(root)
  assert.equal(snapshot.entry, entry)
  assert.deepEqual(snapshot.theme, await loadTheme(css, root, { staticOnly: true, file: entry }))
  assert.ok(snapshot.watchFiles.includes(imported))
  assert.ok(snapshot.watchFiles.includes(palette))
  assert.ok(snapshot.watchFiles.includes(path.join(tailwindPackageDir(), 'index.css')))
  assert.deepEqual(
    (await snapshot.prepareOrder(names)).snapshot,
    (await prepareTailwindOrder(css, root, names, { file: entry })).snapshot,
  )
  const compiler = createCompiler(snapshot.theme)
  const ordinaryWeb = compiler.compile(source)
  const ordinaryNative = compiler.compileNativeModule(source)
  const session = new TailwindProjectSession(compiler, async (candidates, signal) =>
    JSON.stringify((await snapshot.prepareOrder(candidates, signal)).snapshot),
  )
  t.after(() => session.invalidate())
  const [web, native] = await session.emit(
    'both',
    [(value) => value.prepareWebModule(source), (value) => value.prepareNativeModule(source)],
    names,
  )
  assert.deepEqual(web, ordinaryWeb)
  assert.deepEqual(native, ordinaryNative)
  assert.ok(Object.isFrozen(snapshot))
  assert.ok(Object.isFrozen(snapshot.theme.colors[0]))
  assert.throws(
    () => snapshot.theme.colors.push({ token: 'changed', hex: '', oklch: '' }),
    TypeError,
  )
  assert.throws(() => (snapshot.stylesheets[0]!.sha256 = 'changed'), TypeError)
  assert.throws(
    () => Reflect.apply(Array.prototype.push, snapshot.watchFiles, ['changed']),
    TypeError,
  )
  assert.equal(snapshot.tailwindVersion, (await snapshot.prepareOrder([])).snapshot.tailwindVersion)
  assert.equal(snapshot.fingerprint, (await loadProjectTailwindSnapshot(root)).fingerprint)
})

test('import changes and deletion cannot mix a captured theme with new descriptors', async (t) => {
  const { root, entry, imported, palette } = fixture(t)
  const before = await loadProjectTailwindSnapshot(root)
  const firstOrder = (await before.prepareOrder(names)).snapshot
  const oldCompiler = createCompiler(before.theme)
  const oldOutput = oldCompiler.compileNativeModule(source)
  writeFileSync(imported, '@theme { --spacing: 0.5rem; --color-brand: #654321; }')
  const after = await loadProjectTailwindSnapshot(root)
  const newOrder = (await after.prepareOrder(names)).snapshot
  assert.equal(before.theme.spacingPx, 4)
  assert.equal(after.theme.spacingPx, 8)
  assert.notEqual(before.fingerprint, after.fingerprint)
  assert.notDeepEqual(before.stylesheets, after.stylesheets)
  assert.notEqual(firstOrder.fingerprint, newOrder.fingerprint)
  assert.notDeepEqual(oldOutput, createCompiler(after.theme).compileNativeModule(source))
  assert.deepEqual((await before.prepareOrder(names)).snapshot, firstOrder)
  assert.deepEqual(oldCompiler.compileNativeModule(source), oldOutput)
  writeFileSync(imported, '@plugin "./must-not-execute.cjs";')
  await assert.rejects(loadProjectTailwindSnapshot(root), ExecutableStylesheetError)
  rmSync(entry)
  rmSync(imported)
  rmSync(palette)
  assert.deepEqual((await before.prepareOrder(names)).snapshot, firstOrder)
  assert.deepEqual((await after.prepareOrder(names)).snapshot, newOrder)
})

test('candidate preparation is history-independent and copies names before suspension', async (t) => {
  const { root, entry, css } = fixture(t)
  const project = await loadProjectTailwindSnapshot(root)
  const small = ['min-[40rem]:p-2', 'data-[x=b]:p-4']
  const first = await project.prepareOrder(small)
  await project.prepareOrder(['min-[30rem]:p-2', 'data-[x=a]:p-4', ...small])
  const pendingNames = [...small]
  const pending = project.prepareOrder(pendingNames)
  pendingNames.push('p-99')
  const again = await pending
  assert.deepEqual(again.snapshot, first.snapshot)
  assert.deepEqual(
    again.snapshot,
    (await prepareTailwindOrder(css, root, small, { file: entry })).snapshot,
  )
  assert.equal(again.lookup('p-99'), null)
  assert.equal(
    (await project.prepareOrder(['notautility'])).lookup('notautility')?.status,
    'not-generated',
  )
  const controller = new AbortController()
  const cancelled = project.prepareOrder(names, controller.signal)
  controller.abort(new Error('epoch changed'))
  await assert.rejects(cancelled, /epoch changed/)
  await assert.rejects(project.prepareOrder(names, controller.signal), /epoch changed/)
  assert.deepEqual((await project.prepareOrder(small)).snapshot, first.snapshot)
})

test('an imported selector-only edit replaces ordering even when the extracted theme is identical', async (t) => {
  const { root, imported } = fixture(t)
  const input = '@theme { --spacing: 0.25rem; }'
  writeFileSync(imported, `${input} @custom-variant ready (&[data-ready]);`)
  const before = await loadProjectTailwindSnapshot(root)
  const oldOrder = await before.prepareOrder(['ready:p-2'])
  writeFileSync(imported, `${input} @custom-variant ready (&[aria-selected="true"]);`)
  const after = await loadProjectTailwindSnapshot(root)
  const newOrder = await after.prepareOrder(['ready:p-2'])
  assert.deepEqual(before.theme, after.theme)
  assert.notEqual(before.fingerprint, after.fingerprint)
  assert.notEqual(oldOrder.snapshot.fingerprint, newOrder.snapshot.fingerprint)
  assert.notDeepEqual(oldOrder.lookup('ready:p-2')!.rules, newOrder.lookup('ready:p-2')!.rules)
  assert.deepEqual((await before.prepareOrder(['ready:p-2'])).snapshot, oldOrder.snapshot)
})

test('discovery watches absent higher-priority paths; explicit paths never fall back', async (t) => {
  const { root, entry } = fixture(t)
  mkdirSync(path.join(root, 'src'))
  const alternate = path.join(root, 'src/global.css')
  writeFileSync(alternate, '@theme { --spacing: 0.75rem; }')
  rmSync(entry)
  const found = await loadProjectTailwindSnapshot(root)
  assert.equal(found.entry, alternate)
  for (const relative of DEFAULT_CSS_FILES)
    assert.ok(found.watchFiles.includes(path.resolve(root, relative)))
  writeFileSync(entry, '@theme { --spacing: 0.5rem; }')
  const next = await loadProjectTailwindSnapshot(root)
  assert.equal(next.entry, entry)
  assert.equal(found.theme.spacingPx, 12)
  assert.equal(next.theme.spacingPx, 8)
  assert.notEqual(found.fingerprint, next.fingerprint)
  const explicit = await loadProjectTailwindSnapshot(root, { css: 'src/global.css' })
  assert.equal(explicit.entry, alternate)
  assert.equal(explicit.watchFiles.includes(entry), false)
  await assert.rejects(loadProjectTailwindSnapshot(root, { css: 'missing.css' }), /ENOENT/)
  mkdirSync(path.join(root, 'directory.css'))
  await assert.rejects(
    loadProjectTailwindSnapshot(root, { css: 'directory.css' }),
    /not a regular file/,
  )
})

test('a project without an entry uses captured Tailwind defaults and watches discovery', async (t) => {
  const { root, entry, imported } = fixture(t)
  rmSync(entry)
  rmSync(imported)
  const defaults = await loadProjectTailwindSnapshot(root)
  assert.equal(defaults.entry, null)
  assert.equal(defaults.theme.spacingPx, 4)
  assert.ok(defaults.watchFiles.includes(entry))
  assert.ok(defaults.watchFiles.every((file) => !file.endsWith('<entry>')))
  assert.deepEqual(
    (await defaults.prepareOrder(names)).snapshot,
    (await prepareTailwindOrder('@import "tailwindcss";', tailwindPackageDir(), names)).snapshot,
  )
  writeFileSync(entry, '@theme { --spacing: 0.5rem; }')
  assert.equal((await loadProjectTailwindSnapshot(root)).theme.spacingPx, 8)
  assert.equal(defaults.theme.spacingPx, 4)
})

test('unsafe, missing and malformed project CSS cannot publish a defaulted or partial epoch', async (t) => {
  const { root, entry, imported } = fixture(t)
  const config = path.join(root, 'config.cjs')
  writeFileSync(config, 'throw new Error("must never execute app configuration")')
  for (const directive of ['@config "./config.cjs";', '@plugin "./config.cjs";']) {
    writeFileSync(imported, directive)
    await assert.rejects(loadProjectTailwindSnapshot(root), ExecutableStylesheetError)
    writeFileSync(entry, directive)
    await assert.rejects(loadProjectTailwindSnapshot(root), ExecutableStylesheetError)
    writeFileSync(entry, '@import "./tokens.css";')
  }
  for (const input of ['@import "./missing.css";', '@theme {']) {
    writeFileSync(entry, input)
    await assert.rejects(loadProjectTailwindSnapshot(root))
  }
  writeFileSync(entry, '@import "https://example.invalid/theme.css";')
  await assert.rejects(loadProjectTailwindSnapshot(root), ExecutableStylesheetError)
  assert.equal(
    readFileSync(config, 'utf8'),
    'throw new Error("must never execute app configuration")',
  )
})

test('a replacement epoch invalidates old pending IR and delivers only matching new theme/order', async (t) => {
  const { root, imported } = fixture(t)
  const first = await loadProjectTailwindSnapshot(root)
  const started = Promise.withResolvers<void>()
  const gate = Promise.withResolvers<void>()
  const old = new TailwindProjectSession(
    createCompiler(first.theme),
    async (candidates, signal) => {
      started.resolve()
      await gate.promise
      return JSON.stringify((await first.prepareOrder(candidates, signal)).snapshot)
    },
  )
  t.after(() => old.invalidate())
  const pending = old.emit('source', [(compiler) => compiler.prepareNativeModule(source)], names)
  const rejection = assert.rejects(pending, { code: 'TAILWIND_PROJECT_INVALIDATED' })
  await started.promise
  writeFileSync(imported, '@theme { --spacing: 0.5rem; --color-brand: #654321; }')
  old.invalidate()
  const next = await loadProjectTailwindSnapshot(root)
  const compiler = createCompiler(next.theme)
  const session = new TailwindProjectSession(compiler, async (candidates, signal) =>
    JSON.stringify((await next.prepareOrder(candidates, signal)).snapshot),
  )
  t.after(() => session.invalidate())
  const [output] = await session.emit(
    'source',
    [(value) => value.prepareNativeModule(source)],
    names,
  )
  assert.deepEqual(output, compiler.compileNativeModule(source))
  const order = await next.prepareOrder(names)
  compiler.setTailwindOrder(JSON.stringify(order.snapshot))
  assert.equal(compiler.inspectTailwindOrder(source).fingerprint, order.snapshot.fingerprint)
  gate.resolve()
  await rejection
})
