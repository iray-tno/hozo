import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createCompiler } from '@hozo/compiler'
import { lowerModule, sideEffectImport } from '@hozo/compiler/lower'
import { importSpecifier, TailwindProjectSession } from '@hozo/compiler/project'
import { loadProjectTailwindSnapshot } from '@hozo/tailwind'
import { hozo } from './index.ts'
import { openViteTailwindEpoch, ViteTailwindEpoch } from './tailwind-epoch.ts'

function project(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-vite-epoch-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const entry = path.join(root, 'global.css')
  const imported = path.join(root, 'tokens.css')
  const file = path.join(root, 'App.tsx')
  writeFileSync(entry, '@import "tailwindcss"; @import "./tokens.css";')
  writeFileSync(imported, '@theme { --spacing: 0.25rem; }')
  return { root, entry, imported, file }
}

const source = (classes = 'p-4') =>
  `import {View} from '@hozo/core'; export const App=()=> <View className="${classes}" />`

async function pluginFor(t, root) {
  const warnings: string[] = [],
    watched: string[] = []
  const plugin = hozo({ root })[0]!
  const context = {
    resolve: async () => null,
    warn: (message) => warnings.push(message),
    addWatchFile: (file) => watched.push(file),
    environment: { name: 'client' },
  }
  t.after(() => plugin.closeBundle.call(context))
  plugin.configResolved.call(context, { root })
  await plugin.buildStart.call(context)
  return { plugin, context, warnings, watched }
}

test('default plugin uses one post-Canvas prepared parse then actual ready emission, not ordinary primitive compilation', async (t) => {
  const { root, imported, file } = project(t)
  const input = `import {View} from '@hozo/core'; import {Canvas} from '@hozo/canvas';
    export const App=()=> <View className="p-4"><Canvas width={20} height={20}><Canvas.Rect x={0} y={0} width={20} height={20} className="fill-red-500" /></Canvas></View>`
  writeFileSync(file, input)
  const original = ViteTailwindEpoch.prototype.classOrder
  let prepared = 0,
    ready = 0
  const seen = new Set<ViteTailwindEpoch>()
  t.mock.method(ViteTailwindEpoch.prototype, 'classOrder', function (names) {
    if (!seen.has(this)) {
      seen.add(this)
      const compiler = this.compiler
      const prepare = compiler.prepareWebModule.bind(compiler)
      const attempt = compiler.compileWebOrPrepare.bind(compiler)
      compiler.prepareWebModule = (...args) => {
        prepared++
        assert.doesNotMatch(args[0], /className="fill-red-500"/)
        assert.match(args[0], /fill=/)
        return prepare(...args)
      }
      compiler.compileWebOrPrepare = (...args) => {
        ready++
        return attempt(...args)
      }
      compiler.compile = () => {
        throw new Error('ordinary primitive path must not be called')
      }
      compiler.setTailwindOrder = () => {
        throw new Error('no global context setter')
      }
    }
    return original.call(this, names)
  })
  const { plugin, context, watched } = await pluginFor(t, root)
  assert.ok(watched.includes(imported))
  assert.ok(watched.includes(path.join(root, 'src/global.css')))
  const first = await plugin.transform.call(context, input, file)
  const second = await plugin.transform.call(context, input, file)
  assert.deepEqual(first, second)
  const control = lowerModule(input, file, file, createCompiler([...seen][0]!.theme), root)!
  const expected =
    sideEffectImport(importSpecifier(file, path.join(root, 'node_modules/.hozo/preflight.css'))) +
    sideEffectImport(`./${control.cssFileName}`) +
    sideEffectImport(importSpecifier(file, path.join(root, 'node_modules/.hozo/candidates.css'))) +
    control.code
  assert.equal(first.code, expected, 'complete generated code matches ordinary lowering')
  assert.equal(readFileSync(`${file}.hozo.css`, 'utf8'), control.css)
  assert.equal(prepared, 1)
  assert.equal(ready, 1)
  assert.match(readFileSync(`${file}.hozo.css`, 'utf8'), /padding-top: 16px/)
  assert.doesNotMatch(
    readFileSync(path.join(root, 'node_modules/.hozo/candidates.css'), 'utf8'),
    /\.p-4[\s{:]/,
  )
})

test('an actual parsed candidate missing from the lexical seed expands the same retained parse and becomes ready', async (t) => {
  const { root, file } = project(t)
  const input = `import {View} from '@hozo/core'; export const App=()=> <View className={"p-\\x34"}/>`
  writeFileSync(file, input)
  const original = ViteTailwindEpoch.prototype.classOrder
  let prepared = 0,
    ready = 0
  const seen = new Set<ViteTailwindEpoch>()
  t.mock.method(ViteTailwindEpoch.prototype, 'classOrder', function (names) {
    if (!seen.has(this)) {
      seen.add(this)
      assert.equal(names.includes('p-4'), false)
      const compiler = this.compiler
      const prepare = compiler.prepareWebModule.bind(compiler)
      const attempt = compiler.compileWebOrPrepare.bind(compiler)
      compiler.prepareWebModule = (...args) => {
        prepared++
        return prepare(...args)
      }
      compiler.compileWebOrPrepare = (...args) => {
        ready++
        return attempt(...args)
      }
      compiler.compile = () => {
        throw new Error('no ordinary reparse')
      }
    }
    return original.call(this, names)
  })
  const { plugin, context } = await pluginFor(t, root)
  const first = await plugin.transform.call(context, input, file)
  assert.match(readFileSync(`${file}.hozo.css`, 'utf8'), /padding-top: 16px/)
  assert.deepEqual(await plugin.transform.call(context, input, file), first)
  assert.equal(prepared, 1)
  assert.equal(ready, 1)
})

test('the project ordering seed includes other files static classes, so distinct files reuse the ready context', async (t) => {
  const { root } = project(t)
  const files = Array.from({ length: 24 }, (_, index) => ({
    file: path.join(root, `Part${index}.tsx`),
    code: source(`p-${index + 1}`),
  }))
  for (const { file, code } of files) writeFileSync(file, code)
  const original = ViteTailwindEpoch.prototype.classOrder
  let retained = 0,
    direct = 0,
    orderRequests = 0
  t.mock.method(ViteTailwindEpoch.prototype, 'classOrder', function (names) {
    orderRequests++
    const compiler = this.compiler
    const prepare = compiler.prepareWebModule.bind(compiler)
    const ready = compiler.compileWebOrPrepare.bind(compiler)
    compiler.prepareWebModule = (...args) => {
      retained++
      return prepare(...args)
    }
    compiler.compileWebOrPrepare = (...args) => {
      direct++
      const result = ready(...args)
      assert.ok(Array.isArray(result), 'every seeded distinct file must be an actual ready hit')
      return result
    }
    compiler.compile = () => {
      throw new Error('no ordinary module parse')
    }
    return original.call(this, names)
  })
  const { plugin, context } = await pluginFor(t, root)
  for (const { file, code } of files) assert.ok(await plugin.transform.call(context, code, file))
  assert.equal(retained, 1)
  assert.equal(direct, files.length - 1)
  const sameClasses = `${files[0]!.code}\n/* another revision */`
  writeFileSync(files[0]!.file, sameClasses)
  await plugin.watchChange.call(context, files[0]!.file, { event: 'update' })
  await plugin.transform.call(context, sameClasses, files[0]!.file)
  assert.equal(retained, 1)
  assert.equal(direct, files.length)
  assert.equal(
    orderRequests,
    1,
    'an unchanged class universe does not rebuild order on code-only edits',
  )
  assert.equal(readFileSync(path.join(root, 'node_modules/.hozo/candidates.css'), 'utf8'), '')
})

test('an epoch closed during non-cooperative preparation rejects late order/code instead of installing it', async (t) => {
  const { root } = project(t)
  const snapshot = await loadProjectTailwindSnapshot(root)
  const gate = Promise.withResolvers<void>(),
    started = Promise.withResolvers<void>()
  let calls = 0
  const epoch = new ViteTailwindEpoch(
    root,
    {},
    {
      ...snapshot,
      prepareOrder: async (names) => {
        calls++
        started.resolve()
        await gate.promise
        return snapshot.prepareOrder(names)
      },
    },
    snapshot.theme,
  )
  t.after(() => epoch.invalidate())
  const order = epoch.classOrder(['p-4'])
  const rejectedOrder = assert.rejects(order, { code: 'TAILWIND_PROJECT_INVALIDATED' })
  const output = epoch.session!.emit(
    'source',
    [(compiler) => compiler.prepareWebModule(source())],
    ['p-4'],
  )
  const rejectedOutput = assert.rejects(output, { code: 'TAILWIND_PROJECT_INVALIDATED' })
  await started.promise
  epoch.invalidate()
  gate.resolve()
  await rejectedOrder
  await rejectedOutput
  assert.equal(calls, 1, 'sheet order and compiler context reuse one preparation')
})

test('adoption validation detects imported edits and higher-priority entry creation without hot-file polling', async (t) => {
  const { root, entry, imported } = project(t)
  const first = await openViteTailwindEpoch(root, {}, () => {})
  t.after(() => first.invalidate())
  assert.equal(first.isCurrent(), true)
  writeFileSync(imported, '@theme { --spacing: 0.5rem; }')
  assert.equal(first.isCurrent(), false)
  const second = await openViteTailwindEpoch(root, {}, () => {})
  t.after(() => second.invalidate())
  assert.equal(second.isCurrent(), true)
  rmSync(entry)
  mkdirSync(path.join(root, 'src'))
  writeFileSync(path.join(root, 'src/global.css'), '@theme { --spacing: 0.75rem; }')
  const discovered = await openViteTailwindEpoch(root, {}, () => {})
  t.after(() => discovered.invalidate())
  assert.equal(discovered.isCurrent(), true)
  writeFileSync(entry, '@theme { --spacing: 0.5rem; }')
  assert.equal(discovered.isCurrent(), false)
})

test('CSS replacement prevents a completed-but-not-delivered old transform from writing a companion file', async (t) => {
  const { root, imported, file } = project(t)
  const input = source()
  writeFileSync(file, input)
  const gate = Promise.withResolvers<void>(),
    started = Promise.withResolvers<void>()
  const run = TailwindProjectSession.prototype.runModule
  let calls = 0
  t.mock.method(TailwindProjectSession.prototype, 'runModule', async function (...args) {
    const output = await run.apply(this, args)
    if (++calls === 1) {
      started.resolve()
      await gate.promise
    }
    return output
  })
  const { plugin, context } = await pluginFor(t, root)
  const pending = plugin.transform.call(context, input, file)
  const rejected = assert.rejects(pending, { code: 'TAILWIND_PROJECT_INVALIDATED' })
  await started.promise
  writeFileSync(imported, '@theme { --spacing: 0.5rem; }')
  await plugin.watchChange.call(context, imported, { event: 'update' })
  gate.resolve()
  await rejected
  assert.throws(() => readFileSync(`${file}.hozo.css`), /ENOENT/)
  const result = await plugin.transform.call(context, input, file)
  assert.ok(result)
  assert.match(readFileSync(`${file}.hozo.css`, 'utf8'), /padding-top: 32px/)
})

test('source supersession cancels only its environment/query, and deletion cancels pending source delivery', async (t) => {
  const { root, file } = project(t)
  const input = source()
  writeFileSync(file, input)
  const gate = Promise.withResolvers<void>(),
    started = Promise.withResolvers<void>()
  const run = TailwindProjectSession.prototype.runModule
  let calls = 0
  t.mock.method(TailwindProjectSession.prototype, 'runModule', async function (...args) {
    const output = await run.apply(this, args)
    if (++calls === 1) {
      started.resolve()
      await gate.promise
    }
    return output
  })
  const { plugin, context } = await pluginFor(t, root)
  const client = plugin.transform.call(context, input, file)
  await started.promise
  const ssr = await plugin.transform.call({ ...context, environment: { name: 'ssr' } }, input, file)
  const query = await plugin.transform.call(context, input, `${file}?version=1`)
  gate.resolve()
  assert.deepEqual(await client, ssr)
  assert.ok(query)
  const deleted = Promise.withResolvers<void>(),
    releasing = Promise.withResolvers<void>()
  t.mock.method(TailwindProjectSession.prototype, 'runModule', async function (...args) {
    const output = await run.apply(this, args)
    deleted.resolve()
    await releasing.promise
    return output
  })
  const old = plugin.transform.call(context, input, file)
  const rejected = assert.rejects(old, { code: 'TAILWIND_MODULE_SUPERSEDED' })
  await deleted.promise
  rmSync(file)
  await plugin.watchChange.call(context, file, { event: 'delete' })
  releasing.resolve()
  await rejected
})

test('missing or unassessed CSS keeps the existing warned fallback, without a fabricated ordering context', async (t) => {
  const { root, imported } = project(t)
  const warnings: string[] = []
  writeFileSync(imported, '@plugin "./must-not-execute.cjs";')
  const epoch = await openViteTailwindEpoch(root, {}, (message) => warnings.push(message))
  t.after(() => epoch.invalidate())
  assert.equal(epoch.session, undefined)
  assert.equal(epoch.snapshot, undefined)
  assert.ok(warnings.length > 0)
  assert.match(epoch.compiler.compile(source())[0].css, /padding-top: 16px/)
  assert.deepEqual(await epoch.classOrder(['p-4', 'p-2']), ['p-2', 'p-4'])
})

test('a newer transform of the same source cannot be overwritten by an older delivered result', async (t) => {
  const { root, file } = project(t)
  writeFileSync(file, source('p-2'))
  const gate = Promise.withResolvers<void>(),
    started = Promise.withResolvers<void>()
  const run = TailwindProjectSession.prototype.runModule
  let calls = 0
  t.mock.method(TailwindProjectSession.prototype, 'runModule', async function (...args) {
    const output = await run.apply(this, args)
    if (++calls === 1) {
      started.resolve()
      await gate.promise
    }
    return output
  })
  const { plugin, context } = await pluginFor(t, root)
  const old = plugin.transform.call(context, source('p-2'), file)
  const rejected = assert.rejects(old, { code: 'TAILWIND_MODULE_SUPERSEDED' })
  await started.promise
  writeFileSync(file, source('p-4'))
  await plugin.transform.call(context, source('p-4'), file)
  gate.resolve()
  await rejected
  assert.match(readFileSync(`${file}.hozo.css`, 'utf8'), /padding-top: 16px/)
  assert.doesNotMatch(readFileSync(`${file}.hozo.css`, 'utf8'), /padding-top: 8px/)
})

test('concurrent actual-name expansion retries only the obsolete namespace before publishing', async (t) => {
  const { root, file } = project(t)
  const other = path.join(root, 'Other.tsx')
  const a = `import {View} from '@hozo/core'; export const A=()=> <View className={"p-\\x32"}/>`
  const b = `import {View} from '@hozo/core'; export const B=()=> <View className={"p-\\x34"}/>`
  writeFileSync(file, a)
  writeFileSync(other, b)
  const gate = Promise.withResolvers<void>(),
    started = Promise.withResolvers<void>()
  const run = TailwindProjectSession.prototype.runModule
  let calls = 0
  t.mock.method(TailwindProjectSession.prototype, 'runModule', async function (...args) {
    const output = await run.apply(this, args)
    if (++calls === 1) {
      started.resolve()
      await gate.promise
    }
    return output
  })
  const { plugin, context } = await pluginFor(t, root)
  const first = plugin.transform.call(context, a, file)
  await started.promise
  await plugin.transform.call(context, b, other)
  assert.throws(() => readFileSync(`${file}.hozo.css`), /ENOENT/)
  gate.resolve()
  assert.ok(await first)
  assert.equal(calls, 3, 'two first attempts plus one obsolete-namespace retry')
  assert.match(readFileSync(`${file}.hozo.css`, 'utf8'), /padding-top: 8px/)
  assert.match(readFileSync(`${other}.hozo.css`, 'utf8'), /padding-top: 16px/)
})
