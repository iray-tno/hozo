import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { openCandidateCache } from '@hozo/compiler'
import { CACHE_DIR, StylexModuleCache } from '@hozo/compiler/project'
import { createClassResolver } from '../../engine/src/class-resolver.ts'
import { ownerMetroFixture } from '../fixtures/owner-metro-resolver.mjs'
import { metroStatePath, readMetroState, withHozo, withHozoOwnerCandidates } from './config.ts'
import { getCacheKey, transform } from './index.ts'
import { collectMetroOwnerPreflight } from './owner-manifest-preflight.ts'
import { candidateModulePath } from './project.ts'

function fixture(t, platform = 'android') {
  const f = ownerMetroFixture(t)
  mkdirSync(path.join(f.root, 'src'))
  const filename = path.join(f.root, 'src', 'Row.tsx')
  const source = `import {View} from '@hozo/core';export const Row=()=> <View className="p-4"/>`
  writeFileSync(filename, source)
  writeFileSync(path.join(f.root, 'global.css'), '@theme {--spacing:7px;} @tailwind utilities;')
  const upstream = path.join(f.root, 'upstream.cjs')
  writeFileSync(
    upstream,
    'module.exports={transform:async p=>{p.entered?.();if(p.wait)await p.wait;return p.src},getCacheKey:()=> "upstream"}',
  )
  const config = {
    projectRoot: f.root,
    resolver: { resolveRequest: f.delegate },
    transformer: { babelTransformerPath: upstream },
  }
  const options = { css: 'global.css', content: { packages: [] } }
  const preflight = () =>
    collectMetroOwnerPreflight(f.context, f.delegate, {
      platform,
      epoch: 'candidate-consumer',
      origins: [f.context.originModulePath],
    })
  return {
    ...f,
    config,
    options,
    preflight,
    params: { src: source, filename, options: { projectRoot: f.root, platform } },
  }
}

function resolver(root: string) {
  const code = readFileSync(candidateModulePath(root), 'utf8')
  return runInNewContext(
    `${code.replace(/^import .*$/gm, '').replaceAll('export const ', 'const ')}\nhozoClasses`,
    { createClassResolver },
  ) as ReturnType<typeof createClassResolver>
}

test('two actual Metro-resolved package instances feed the real themed resolver and static worker', {
  timeout: 10000,
}, async (t) => {
  for (const platform of ['android', 'ios']) {
    const f = fixture(t, platform)
    await withHozo(f.config, f.options)
    const normalKey = getCacheKey({ projectRoot: f.root })
    assert.equal(
      resolver(f.root)('p-2').length,
      0,
      'package-only token is absent on the normal path',
    )
    const configured = await withHozoOwnerCandidates(f.config, f.preflight(), f.options)
    assert.equal(readMetroState(f.root)?.ownerShadow?.mode, 'candidate-consumption')
    assert.notEqual(getCacheKey({ projectRoot: f.root }), normalKey)
    const resolve = resolver(f.root)
    assert.equal(Object.assign({}, ...resolve('p-2')).paddingTop, 14)
    assert.equal(
      Object.assign({}, ...resolve('p-4')).paddingTop,
      28,
      'static authored use must not subtract manifest use',
    )
    const runtime = configured.resolver.resolveRequest(f.context, '@hozo/engine/project', platform)
    assert.equal(runtime.filePath, candidateModulePath(f.root))
    assert.equal(
      configured.resolver.resolveRequest(f.context, 'kit', platform).filePath,
      path.join(f.first, `${platform}.js`),
    )
    assert.match((await transform(f.params)) as string, /paddingTop:\s*28/)
    const state = readMetroState(f.root)!
    const ordering = JSON.parse(readFileSync(state.tailwind!.file, 'utf8'))
    assert.ok(ordering.candidates.includes('p-2') && ordering.candidates.includes('p-4'))
    // No synthetic record is left for the next normal build to pick up.
    await withHozo(f.config, f.options)
    assert.equal(readMetroState(f.root)?.ownerShadow, undefined)
    assert.equal(resolver(f.root)('p-2').length, 0)
  }
})

test('manifest-only candidates participate in auto preflight without scanning package source', {
  timeout: 10000,
}, async (t) => {
  const f = fixture(t)
  const options = { ...f.options, content: { include: [], packages: [] } }
  await withHozo(f.config, options)
  assert.equal(readMetroState(f.root)?.preflight, false)
  await withHozoOwnerCandidates(f.config, f.preflight(), options)
  assert.equal(readMetroState(f.root)?.preflight, true)
  assert.equal(Object.assign({}, ...resolver(f.root)('p-2')).paddingTop, 14)
})

test('a manifest change during generation cannot publish a mixed map or replace existing config', {
  timeout: 10000,
}, async (t) => {
  const f = fixture(t)
  await withHozo(f.config, f.options)
  const beforeMap = readFileSync(candidateModulePath(f.root), 'utf8')
  const beforeState = readFileSync(metroStatePath(f.root), 'utf8')
  const prototype = Object.getPrototypeOf(openCandidateCache())
  const render = prototype.renderNativeModulePlan
  t.mock.method(prototype, 'renderNativeModulePlan', function (...args) {
    const result = render.apply(this, args)
    const file = path.join(f.first, 'owner.json')
    const data = JSON.parse(readFileSync(file, 'utf8'))
    data.candidates.push('m-8')
    writeFileSync(file, JSON.stringify(data))
    return result
  })
  await assert.rejects(
    withHozoOwnerCandidates(f.config, f.preflight(), f.options),
    /changed during preparation/,
  )
  assert.equal(readFileSync(candidateModulePath(f.root), 'utf8'), beforeMap)
  assert.equal(readFileSync(metroStatePath(f.root), 'utf8'), beforeState)
})

test('incomplete input or unavailable CSS context cannot publish a partial candidate map', {
  timeout: 10000,
}, async (t) => {
  const f = fixture(t)
  await assert.rejects(
    withHozoOwnerCandidates(f.config, { status: 'incomplete', issues: ['missing'] }, f.options),
    /INCOMPLETE/,
  )
  writeFileSync(path.join(f.root, 'global.css'), '@import "./missing.css";')
  await assert.rejects(
    withHozoOwnerCandidates(f.config, f.preflight(), f.options),
    /requires a Tailwind snapshot/,
  )
  assert.equal(existsSync(candidateModulePath(f.root)), false)
  assert.equal(existsSync(metroStatePath(f.root)), false)
})

test('a late resolution retires actual upstream output on the consuming path too', {
  timeout: 10000,
}, async (t) => {
  const f = fixture(t)
  const metadata = path.join(f.root, 'node_modules', 'ordinary', 'package.json')
  const data = JSON.parse(readFileSync(metadata, 'utf8'))
  data.exports['./alternate.js'] = './alternate.js'
  writeFileSync(metadata, JSON.stringify(data))
  const configured = await withHozoOwnerCandidates(f.config, f.preflight(), f.options)
  let enter = () => {},
    release = () => {}
  const started = new Promise<void>((resolve) => {
    enter = resolve
  })
  const wait = new Promise<void>((resolve) => {
    release = resolve
  })
  const pending = transform({ ...f.params, entered: enter, wait })
  await started
  try {
    assert.throws(
      () => configured.resolver.resolveRequest(f.context, 'ordinary/alternate.js', 'android'),
      /unassessed or changed/,
    )
  } finally {
    release()
  }
  await assert.rejects(pending, /INVALIDATED/)
})

function discoverable(dir: string) {
  const file = path.join(dir, 'package.json')
  const data = JSON.parse(readFileSync(file, 'utf8'))
  data.exports['./package.json'] = './package.json'
  writeFileSync(file, JSON.stringify(data))
}

test('manifest-backed instances stop candidate extraction while StyleX, helper and ordinary sources remain', {
  timeout: 10000,
}, async (t) => {
  const f = fixture(t)
  const ordinary = path.join(f.root, 'node_modules', 'ordinary')
  discoverable(f.first)
  discoverable(ordinary)
  const tokenFile = path.join(f.first, 'tokens.ts')
  writeFileSync(tokenFile, `export const tone='p-4'`)
  writeFileSync(path.join(ordinary, 'tokens.ts'), `export const tone='m-6'`)
  const styles = path.join(f.first, 'styles.ts')
  writeFileSync(
    styles,
    `import * as stylex from '@stylexjs/stylex';export const styles=stylex.create({root:{padding:8}})`,
  )
  writeFileSync(
    path.join(f.first, 'helper.ts'),
    `import {clsx} from 'clsx';import {twMerge} from 'tailwind-merge';export function cn(...inputs){return twMerge(clsx(inputs))}`,
  )
  const caller = path.join(f.first, 'Row.tsx')
  writeFileSync(
    caller,
    `import {View} from '@hozo/core';import {cn} from './helper';export const Row=()=> <View className={cn('p-4')}/>`,
  )
  const options = { ...f.options, content: { packages: ['kit', 'ordinary'] } }
  const prototype = Object.getPrototypeOf(openCandidateCache())
  const scan = prototype.scanFile
  const calls: string[] = []
  t.mock.method(prototype, 'scanFile', function (file, source, revision) {
    calls.push(file)
    return scan.call(this, file, source, revision)
  })
  await withHozo(f.config, options)
  assert.equal(calls.filter((file) => file.startsWith(`${f.first}${path.sep}`)).length, 8)
  const normalHelpers = readMetroState(f.root)?.foundClassHelpers
  assert.deepEqual(normalHelpers?.[caller], [{ module: './helper', name: 'cn' }])
  const persisted = path.join(f.root, CACHE_DIR, 'candidates.json')
  assert.ok(openCandidateCache(persisted).exportFile(tokenFile))
  // Exercise both stale-record retirement and a genuinely cold candidate scan.
  for (const cold of [false, true]) {
    if (cold) rmSync(persisted)
    calls.length = 0
    await withHozoOwnerCandidates(f.config, f.preflight(), options)
    assert.equal(calls.filter((file) => file.startsWith(`${f.first}${path.sep}`)).length, 0)
    if (cold) {
      assert.ok(calls.includes(f.params.filename), 'authored source still uses the scanner')
      assert.ok(
        calls.includes(path.join(ordinary, 'tokens.ts')),
        'ordinary dependency is not covered',
      )
    }
    assert.deepEqual(readMetroState(f.root)?.foundClassHelpers, normalHelpers)
    assert.ok(
      new StylexModuleCache(path.join(f.root, CACHE_DIR, 'stylex-modules.json')).get(styles),
    )
    assert.equal(openCandidateCache(persisted).exportFile(tokenFile), null)
    assert.equal(Object.assign({}, ...resolver(f.root)('p-4')).paddingTop, 28)
    assert.equal(Object.assign({}, ...resolver(f.root)('m-6')).marginTop, 42)
    assert.equal(Object.assign({}, ...resolver(f.root)('p-2')).paddingTop, 14)
  }
  await withHozo(f.config, options)
  assert.ok(
    openCandidateCache(persisted).exportFile(tokenFile),
    'normal restart restores its original scan',
  )
})

test('empty or unrecognized manifests retain source extraction needed for auto preflight', {
  timeout: 10000,
}, async (t) => {
  for (const candidates of [[], ['not-a-utility']]) {
    const f = fixture(t)
    discoverable(f.first)
    const staticFile = path.join(f.first, 'Static.tsx')
    writeFileSync(
      staticFile,
      `import {View} from '@hozo/core';export const Row=()=> <View className="p-4"/>`,
    )
    for (const dir of [f.first, f.second]) {
      const file = path.join(dir, 'owner.json')
      const data = JSON.parse(readFileSync(file, 'utf8'))
      data.candidates = candidates
      writeFileSync(file, JSON.stringify(data))
    }
    const options = { ...f.options, content: { include: [], packages: ['kit'] } }
    await withHozoOwnerCandidates(f.config, f.preflight(), options)
    assert.equal(readMetroState(f.root)?.preflight, true)
    assert.ok(
      openCandidateCache(path.join(f.root, CACHE_DIR, 'candidates.json')).exportFile(staticFile),
    )
  }
})

test('a manifest on another version cannot suppress an ordinary same-name instance', {
  timeout: 10000,
}, async (t) => {
  const f = fixture(t)
  discoverable(f.first)
  const metadata = path.join(f.first, 'package.json')
  const data = JSON.parse(readFileSync(metadata, 'utf8'))
  delete data.hozo
  writeFileSync(metadata, JSON.stringify(data))
  const tokenFile = path.join(f.first, 'tokens.ts')
  writeFileSync(tokenFile, `export const tone='m-6'`)
  const options = { ...f.options, content: { packages: ['kit'] } }
  await withHozoOwnerCandidates(f.config, f.preflight(), options)
  assert.ok(
    openCandidateCache(path.join(f.root, CACHE_DIR, 'candidates.json')).exportFile(tokenFile),
  )
  assert.equal(Object.assign({}, ...resolver(f.root)('m-6')).marginTop, 42)
  assert.equal(Object.assign({}, ...resolver(f.root)('p-2')).paddingTop, 14)
})

test('a packed and offline-installed non-Hozo dependency reaches the generated runtime without checkout leakage', {
  timeout: 30000,
}, async (t) => {
  const f = fixture(t)
  const stage = path.join(f.root, 'packing')
  cpSync(new URL('../fixtures/owner-candidate-package/', import.meta.url), stage, {
    recursive: true,
  })
  const nodeDirectory = path.dirname(process.execPath)
  const npm = [
    path.join(nodeDirectory, 'node_modules/npm/bin/npm-cli.js'),
    path.join(nodeDirectory, '../lib/node_modules/npm/bin/npm-cli.js'),
  ].find(existsSync)
  assert.ok(npm, 'the pinned Node distribution must provide its npm CLI')
  const run = (args: string[], cwd: string) =>
    execFileSync(process.execPath, [npm, ...args], {
      cwd,
      encoding: 'utf8',
      timeout: 15000,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  // Call the bundled CLI directly: no Windows .cmd wrapper, shell interpolation,
  // registry access, lifecycle execution, app build or repository install.
  const packed = JSON.parse(
    run(['pack', '--ignore-scripts', '--json', '--offline', '--cache', './npm-cache'], stage),
  )[0]
  assert.equal(packed.filename, 'acme-frozen-styles-1.0.0.tgz')
  assert.deepEqual(packed.files.map((file) => file.path).sort(), [
    'android.js',
    'index.js',
    'ios.js',
    'owner.json',
    'package.json',
    'tokens.js',
  ])
  const metadata = path.join(f.root, 'package.json')
  const project = JSON.parse(readFileSync(metadata, 'utf8'))
  project.dependencies = {}
  writeFileSync(metadata, JSON.stringify(project))
  run(
    [
      'install',
      '--ignore-scripts',
      '--offline',
      '--no-audit',
      '--no-fund',
      '--package-lock=false',
      '--cache',
      './npm-cache',
      './packing/acme-frozen-styles-1.0.0.tgz',
    ],
    f.root,
  )
  const installed = path.join(f.root, 'node_modules', 'acme-frozen-styles')
  f.roots.push(installed)
  assert.equal(existsSync(path.join(installed, 'not-packed.js')), false)
  assert.equal(
    readFileSync(path.join(installed, 'owner.json'), 'utf8'),
    readFileSync(path.join(stage, 'owner.json'), 'utf8'),
  )
  const source = `import {View} from '@hozo/core';import {token} from 'acme-frozen-styles';export const Row=()=> <View className={token}/>`
  writeFileSync(f.params.filename, source)
  const params = { ...f.params, src: source }
  const options = {
    ...f.options,
    content: { include: ['src/**'], packages: ['acme-frozen-styles'] },
  }
  await withHozo(f.config, options)
  const before = readFileSync(candidateModulePath(f.root), 'utf8')
  const normalOutput = await transform(params)
  const configured = await withHozoOwnerCandidates(f.config, f.preflight(), options)
  assert.equal(
    configured.resolver.resolveRequest(f.context, 'acme-frozen-styles', 'android').filePath,
    path.join(installed, 'android.js'),
  )
  assert.equal(
    readFileSync(candidateModulePath(f.root), 'utf8'),
    before,
    'manifest and ordinary package source produce identical resolver bytes',
  )
  assert.equal(await transform(params), normalOutput)
  assert.match(normalOutput as string, /hozoClasses\(token\)/)
  const resolve = resolver(f.root)
  assert.equal(Object.assign({}, ...resolve('p-3')).paddingTop, 21)
  assert.equal(Object.assign({}, ...resolve('p-5')).paddingTop, 35)
  assert.equal(resolve('p-96').length, 0)
  const cache = openCandidateCache(path.join(f.root, CACHE_DIR, 'candidates.json'))
  assert.equal(cache.exportFile(path.join(installed, 'tokens.js')), null)
  assert.ok(cache.exportFile(f.params.filename))
})
