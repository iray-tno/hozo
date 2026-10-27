import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test, { type TestContext } from 'node:test'
import { createCompiler } from '@hozo/compiler'
import { lowerModule } from '@hozo/compiler/lower'
import { loadProjectClassOrder, loadProjectTailwindSnapshot } from '@hozo/tailwind'
import { nextTailwindProject } from '../dist/tailwind-epoch.js'
import loader from '../loader.js'
import { type HozoLoaderOptions, withHozo } from './index.ts'

function fixture(t: TestContext) {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-next-session-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(path.join(root, 'src'))
  const file = path.join(root, 'src', 'Card.tsx')
  const entry = path.join(root, 'global.css')
  const palette = path.join(root, 'palette.css')
  const source = `import {View,Text} from '@hozo/core'; export const A=()=> <View className="p-2"><Text className="text-brand">Hello</Text></View>`
  writeFileSync(file, source)
  writeFileSync(entry, '@import "tailwindcss"; @import "./palette.css";')
  writeFileSync(palette, '@theme { --color-brand: #123456; --spacing: 7px; }')
  writeFileSync(
    path.join(root, 'src', 'tone.ts'),
    `export const tone=()=> 'md:hidden sm:block hidden bg-brand'`,
  )
  const config = withHozo({}, { root }) as unknown as {
    turbopack: { rules: { '*.tsx': { loaders: { options: HozoLoaderOptions }[] } } }
  }
  const options = config.turbopack.rules['*.tsx'].loaders[0]!.options
  return { root, file, entry, palette, source, options }
}

function invoke(options: HozoLoaderOptions, source: string, file: string, query = '') {
  const dependencies = new Set<string>()
  const missing = new Set<string>()
  const warnings: Error[] = []
  const work = new Promise<string>((resolve, reject) => {
    loader.call(
      {
        resourcePath: file,
        resourceQuery: query,
        getOptions: () => options,
        addDependency: (file: string) => dependencies.add(file),
        addMissingDependency: (file: string) => missing.add(file),
        getResolve: () => async () => undefined,
        emitWarning: (error: Error) => warnings.push(error),
        async: () => (error: Error | undefined, code: string) =>
          error ? reject(error) : resolve(code),
      },
      source,
    )
  })
  return { work, dependencies, missing, warnings }
}

test('the actual default loader emits common scalar winners for both orders and replaces its CSS epoch', async (t) => {
  const { file, palette, options } = fixture(t)
  for (const spacing of [7, 11]) {
    writeFileSync(palette, `@theme {--spacing:${spacing}px;}`)
    for (const classes of ['p-4 p-2', 'p-2 p-4']) {
      const input = `import {View} from '@hozo/core';export const A=()=> <View className="${classes}"/>`
      await invoke(options, input, file).work
      const css = readFileSync(`${file}.hozo.css`, 'utf8')
      assert.match(css, new RegExp(`padding-top: ${spacing * 4}px`))
      assert.doesNotMatch(css, new RegExp(`padding-top: ${spacing * 2}px`))
    }
  }
  ;(await nextTailwindProject(options)).invalidate()
})

test('the actual default loader preserves full Web output and shares its theme with candidate CSS', async (t) => {
  const { root, file, entry, palette, source, options } = fixture(t)
  const snapshot = await loadProjectTailwindSnapshot(root)
  const expected = lowerModule(source, file, file, createCompiler(snapshot.theme), root)!
  const request = invoke(options, source, file)
  const code = await request.work
  assert.ok(code.endsWith(expected.code))
  assert.equal(readFileSync(expected.cssPath, 'utf8'), expected.css)
  const candidateCss = readFileSync(options.candidateCssPath, 'utf8')
  assert.match(candidateCss, /\.bg-brand/)
  assert.match(candidateCss, /#123456/)
  assert.doesNotMatch(candidateCss, /\.p-2\b/, 'static ordering names must not grow runtime CSS')
  assert.ok(request.dependencies.has(entry))
  assert.ok(request.dependencies.has(palette))
  assert.ok(request.missing.has(path.join(root, 'src', 'index.css')))
  const state = await nextTailwindProject(options)
  assert.equal(
    candidateCss,
    state.cache.renderCss(
      snapshot.theme,
      await loadProjectClassOrder(root, state.cache.candidates(), { fresh: true }),
    ),
  )
  t.after(() => state.invalidate())
  assert.ok(state.session)
  assert.ok(options.orderingCandidates.includes('p-2'))
})

test('twenty default loader modules use one retained parse and nineteen ready attempts', async (t) => {
  const { root, source, options } = fixture(t)
  const state = await nextTailwindProject(options)
  t.after(() => state.invalidate())
  let retained = 0
  let ready = 0
  const prepare = state.compiler.prepareWebModule.bind(state.compiler)
  const attempt = state.compiler.compileWebOrPrepare.bind(state.compiler)
  state.compiler.compile = () => {
    throw new Error('ordinary compiler path')
  }
  state.compiler.setTailwindOrder = () => {
    throw new Error('global context setter')
  }
  state.compiler.prepareWebModule = (...args) => {
    retained++
    return prepare(...args)
  }
  state.compiler.compileWebOrPrepare = (...args) => {
    ready++
    return attempt(...args)
  }
  for (let index = 0; index < 20; index++) {
    await invoke(options, source, path.join(root, 'src', `Source${index}.tsx`)).work
  }
  assert.equal(retained, 1)
  assert.equal(ready, 19)
  await invoke(options, source.replace('p-2', 'p-123'), path.join(root, 'src', 'New.tsx')).work
  const afterMiss = retained
  await invoke(options, source.replace('p-2', 'p-123'), path.join(root, 'src', 'Ready.tsx')).work
  assert.equal(retained, afterMiss)
})

test('imported CSS updates replace the compiler/session and both stylesheets without restarting config', async (t) => {
  const { root, file, palette, source, options } = fixture(t)
  const before = await nextTailwindProject(options)
  await invoke(options, source, file).work
  const original = readFileSync(`${file}.hozo.css`, 'utf8')
  writeFileSync(palette, '@theme { --color-brand: #654321; --spacing: 11px; }')
  const after = await nextTailwindProject(options)
  t.after(() => after.invalidate())
  assert.notEqual(after, before)
  assert.notEqual(after.compiler, before.compiler)
  assert.throws(() => before.check(), { code: 'TAILWIND_PROJECT_INVALIDATED' })
  await invoke(options, source, file).work
  const expected = lowerModule(source, file, file, createCompiler(after.theme), root)!
  assert.equal(readFileSync(expected.cssPath, 'utf8'), expected.css)
  assert.notEqual(expected.css, original)
  assert.match(readFileSync(options.candidateCssPath, 'utf8'), /#654321/)
})

test('creating an earlier conventional entry retires the previously selected stylesheet', async (t) => {
  const { root, file, entry, source, options } = fixture(t)
  rmSync(entry)
  writeFileSync(
    path.join(root, 'src', 'global.css'),
    '@import "tailwindcss"; @import "../palette.css";',
  )
  const before = await nextTailwindProject(options)
  const request = invoke(options, source, file)
  await request.work
  assert.ok(request.missing.has(entry))
  writeFileSync(entry, '@import "tailwindcss"; @theme { --spacing: 19px; --color-brand: #112233; }')
  const after = await nextTailwindProject(options)
  t.after(() => after.invalidate())
  assert.notEqual(after, before)
  await invoke(options, source, file).work
  assert.equal(
    readFileSync(`${file}.hozo.css`, 'utf8'),
    lowerModule(source, file, file, createCompiler(after.theme), root)!.css,
  )
  assert.match(readFileSync(options.candidateCssPath, 'utf8'), /#112233/)
})

test('a completed old transform cannot overwrite new-epoch CSS while waiting for delivery', async (t) => {
  const { file, palette, source, options } = fixture(t)
  const before = await nextTailwindProject(options)
  let enter!: () => void
  let release!: () => void
  const emitted = new Promise<void>((resolve) => {
    enter = resolve
  })
  const paused = new Promise<void>((resolve) => {
    release = resolve
  })
  const runModule = before.session!.runModule.bind(before.session!)
  t.mock.method(before.session!, 'runModule', async (...args) => {
    const result = await runModule(...args)
    enter()
    await paused
    return result
  })
  const stale = invoke(options, source, file)
  const rejected = assert.rejects(stale.work, { code: 'TAILWIND_PROJECT_INVALIDATED' })
  await emitted
  writeFileSync(palette, '@theme { --color-brand: #abcdef; --spacing: 12px; }')
  await invoke(options, source, file).work
  const finalCss = readFileSync(`${file}.hozo.css`, 'utf8')
  const finalCandidates = readFileSync(options.candidateCssPath, 'utf8')
  release()
  await rejected
  assert.equal(readFileSync(`${file}.hozo.css`, 'utf8'), finalCss)
  assert.equal(readFileSync(options.candidateCssPath, 'utf8'), finalCandidates)
  assert.match(finalCandidates, /#abcdef/)
  ;(await nextTailwindProject(options)).invalidate()
})

test('derived sources join the actual namespace and concurrent expansion retries before delivery', async (t) => {
  const { root, file, source, options } = fixture(t)
  const state = await nextTailwindProject(options)
  t.after(() => state.invalidate())
  let enter!: () => void
  let release!: () => void
  const emitted = new Promise<void>((resolve) => {
    enter = resolve
  })
  const paused = new Promise<void>((resolve) => {
    release = resolve
  })
  const runModule = state.session!.runModule.bind(state.session!)
  let calls = 0
  t.mock.method(state.session!, 'runModule', async (...args) => {
    calls++
    const result = await runModule(...args)
    if (calls === 1) {
      enter()
      await paused
    }
    return result
  })
  const first = invoke(options, source, file).work
  await emitted
  const derivedFile = path.join(root, 'src', 'Late.mdx.tsx')
  await invoke(options, source.replace('p-2', 'm-999'), derivedFile).work
  release()
  await first
  assert.ok(state.universe.candidates.includes('m-999'))
  assert.equal(calls, 3, 'only the obsolete namespace is retried')
  assert.equal(
    readFileSync(`${file}.hozo.css`, 'utf8'),
    lowerModule(source, file, file, createCompiler(state.theme), root)!.css,
  )
})

test('supersession uses the full resource/query ID, while no-op and error diagnostics keep their contracts', async (t) => {
  const { file, source, options } = fixture(t)
  const state = await nextTailwindProject(options)
  t.after(() => state.invalidate())
  const one = state.start(JSON.stringify([file, '?a']))
  const other = state.start(JSON.stringify([file, '?b']))
  const newer = state.start(JSON.stringify([file, '?a']))
  assert.throws(one.check, { code: 'TAILWIND_MODULE_SUPERSEDED' })
  other.check()
  newer.check()
  one.finish()
  other.finish()
  newer.finish()
  await invoke(options, `export const tone=()=> 'bg-red-500'`, file, '?a').work
  await invoke(options, `export const tone=()=> 'bg-blue-500'`, file, '?b').work
  const candidates = readFileSync(options.candidateCssPath, 'utf8')
  assert.match(candidates, /\.bg-red-500/)
  assert.match(candidates, /\.bg-blue-500/)
  assert.equal(await invoke(options, 'export const x=1', file).work, 'export const x=1')
  // This malformed module has no trusted import and ordinary lowering leaves
  // it to the bundler parser. Do not invent a stricter staged-only refusal.
  assert.equal(await invoke(options, 'export const = <View>', file).work, 'export const = <View>')
  await assert.rejects(
    invoke(
      { ...options, unloweredReactNativeJsx: 'error' },
      `import {SectionList as Rows} from 'react-native'; export const A=()=> <Rows sections={sections} />`,
      file,
    ).work,
    /UNLOWERED_REACT_NATIVE_JSX/,
  )
  const valid = await invoke(options, source, file).work
  assert.match(valid, /Hello/)
})

test('Canvas, secondary slots, and module diagnostics share ordinary full-module lowering', async (t) => {
  const { root, file, options } = fixture(t)
  const source = `import {View,Avatar} from '@hozo/core'; import {Canvas} from '@hozo/canvas';
export const A=()=> <View className="p-2"><Avatar fallbackClassName="font-bold text-brand"/><Canvas><Canvas.Rect className="fill-red-500"/></Canvas></View>`
  const state = await nextTailwindProject(options)
  t.after(() => state.invalidate())
  const expected = lowerModule(source, file, file, createCompiler(state.theme), root)!
  const actual = invoke(options, source, file)
  const code = await actual.work
  assert.ok(code.endsWith(expected.code))
  assert.equal(readFileSync(expected.cssPath, 'utf8'), expected.css)
  assert.deepEqual(
    actual.warnings.map((warning) => warning.message),
    expected.diagnostics.map((diagnostic) => `[hozo] ${diagnostic.code}: ${diagnostic.message}`),
  )
})

test('unassessed CSS has a warned legacy path, never a default-palette canonical context', async (t) => {
  const { file, entry, source, options } = fixture(t)
  writeFileSync(entry, '@plugin "./must-not-execute.cjs";')
  const warnings: string[] = []
  t.mock.method(console, 'warn', (message: string) => warnings.push(message))
  const state = await nextTailwindProject(options)
  t.after(() => state.invalidate())
  assert.equal(state.session, undefined)
  await invoke(options, source, file).work
  assert.ok(warnings.some((warning) => warning.includes('ordering snapshot unavailable')))
})
