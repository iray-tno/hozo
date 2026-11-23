import assert from 'node:assert/strict'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { createCompiler, openCandidateCache } from '@hozo/compiler'
import {
  CACHE_DIR,
  captureOwnerManifests,
  OwnerManifestEpoch,
  readResolvedOwnerManifest,
  StylexModuleCache,
} from '@hozo/compiler/project'
import { createClassResolver } from '../../engine/src/class-resolver.ts'
import { fixtureNode } from '../fixtures/fixture-process.mjs'
import { ownerMetroFixture } from '../fixtures/owner-metro-resolver.mjs'
import {
  metroStatePath,
  readMetroState,
  withHozo,
  withHozoOwnerCallers,
  withHozoOwnerCandidates,
  withHozoPartialOwners,
  withHozoPartialOwnersOrOrdinary,
} from './config.ts'
import { getCacheKey, transform } from './index.ts'
import { collectMetroOwnerPreflight } from './owner-manifest-preflight.ts'
import { candidateModulePath } from './project.ts'
import { MetroTailwindWorker, readTailwindTransfer } from './tailwind-worker.ts'

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

test('explicit partial-owner fallback selects the unchanged ordinary worker only for bounded refusals', async (t) => {
  const f = fixture(t)
  const ordinary = await withHozo(f.config, f.options)
  const candidate = readFileSync(candidateModulePath(f.root), 'utf8')
  const key = getCacheKey({ projectRoot: f.root })
  const output = await transform(f.params)
  assert.match(String(output), /paddingTop:\s*28/)
  const capture = (options = {}) =>
    collectMetroOwnerPreflight(f.context, f.delegate, {
      origins: [f.context.originModulePath],
      platform: 'android',
      epoch: 'admission',
      ...options,
    })
  const refusal = capture({ maxEdges: 1 })
  await assert.rejects(withHozoPartialOwners(f.config, refusal, f.options), /INCOMPLETE/)
  const fallback = await withHozoPartialOwnersOrOrdinary(f.config, refusal, f.options)
  assert.deepEqual(fallback.admission, { route: 'ordinary-fallback', reason: 'edge-budget' })
  assert.deepEqual(fallback.config.transformer, ordinary.transformer)
  assert.equal(readMetroState(f.root)?.ownerShadow, undefined)
  assert.equal(readFileSync(candidateModulePath(f.root), 'utf8'), candidate)
  assert.equal(getCacheKey({ projectRoot: f.root }), key)
  assert.equal(await transform(f.params), output)

  await assert.rejects(
    withHozoPartialOwnersOrOrdinary(f.config, capture({ maxEdges: 0 }), f.options),
    /INCOMPLETE/,
  )
  const current = capture()
  assert.equal(current.status, 'complete')
  const admitted = await withHozoPartialOwnersOrOrdinary(f.config, current, f.options)
  assert.deepEqual(admitted.admission, { route: 'partial-owners' })
  assert.equal(readMetroState(f.root)?.ownerShadow?.mode, 'owner-caller-transform')
  assert.equal(readMetroState(f.root)?.ownerShadow?.target, 'BottomSheet.handle')
  const metadata = path.join(f.root, 'package.json')
  writeFileSync(metadata, `${readFileSync(metadata, 'utf8')}\n`)
  const before = readFileSync(metroStatePath(f.root), 'utf8')
  await assert.rejects(
    withHozoPartialOwnersOrOrdinary(f.config, current, f.options),
    /metadata changed/,
  )
  assert.equal(readFileSync(metroStatePath(f.root), 'utf8'), before)
})

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

test('candidate consumption transfers only emitted Native fallback candidates', async (t) => {
  const f = fixture(t)
  writeFileSync(f.params.filename, f.params.src.replace('p-4', 'm-7'))
  await withHozo(f.config, f.options)
  const ordinary = await readTailwindTransfer(readMetroState(f.root)!.tailwind!)
  assert.equal(ordinary.nativeRuntime, undefined)
  await withHozoOwnerCandidates(f.config, f.preflight(), f.options)
  const transfer = await readTailwindTransfer(readMetroState(f.root)!.tailwind!)
  assert.ok(transfer.candidates.includes('m-7'), 'static recipe remains in the ordering seed')
  assert.ok(transfer.nativeRuntime?.candidates.includes('p-2'))
  assert.ok(!transfer.nativeRuntime.candidates.includes('m-7'))
  assert.equal(Object.assign({}, ...resolver(f.root)('p-2')).paddingTop, 14)
})

test('explicit Metro partial worker composes proven siblings and children but retains unproven scopes with the same frozen map', async (t) => {
  const f = fixture(t)
  const file = f.params.filename
  const source = `import {BottomSheet} from '@hozo/patterns'; export const Row=()=> <BottomSheet open handleClassName="p-2 hover:opacity-50"/>`
  writeFileSync(file, source)
  await withHozoOwnerCandidates(f.config, f.preflight(), f.options)
  const transfer = await readTailwindTransfer(readMetroState(f.root)!.tailwind!)
  const packageRoot = fileURLToPath(new URL('../../patterns/', import.meta.url))
  const metadata = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'))
  const entry = realpathSync(path.join(packageRoot, metadata.exports['.']['react-native'].default))
  const edge = { importer: file, specifier: '@hozo/patterns' }
  const observation = readResolvedOwnerManifest(edge, {
    packageRoot,
    entry,
    declaredManifest: metadata.hozo.manifest,
  })
  const epoch = new OwnerManifestEpoch()
  epoch.adopt(
    captureOwnerManifests([edge], [observation], {
      platform: 'android',
      epoch: 'metro-partial-test',
    }),
  )
  const lease = epoch.lease()
  const worker = new MetroTailwindWorker(
    createCompiler({ ...transfer.snapshot.theme, preflight: true }),
    transfer,
  )
  t.after(() => {
    worker.invalidate()
    epoch.invalidate()
  })
  const request = { ...edge, entry, imported: 'BottomSheet', classProp: 'handleClassName' }
  const transformPartial = (input: string) =>
    worker.transformOwnerCaller(input, file, f.root, lease, request, 'prepared-partial')
  assert.equal(await worker.transform(source, file, f.root), null)
  assert.match(
    (await transformPartial(source)) ?? '',
    /handleClassName="p-2 hover:opacity-50" hozoInteractiveHandleStyle=/,
  )
  assert.equal(Object.assign({}, ...resolver(f.root)('p-2')).paddingTop, 14)
  assert.equal(await transformPartial(source.replace('opacity-50', 'opacity-75')), null)
  const mixed = `${source}\nimport {View} from '@hozo/core'; export const Other=()=> <View className="p-4"/>`
  const ordinary = await worker.transform(mixed, file, f.root)
  assert.ok(ordinary?.includes('paddingTop: 28'))
  const composed = await transformPartial(mixed)
  assert.match(composed ?? '', /hozoInteractiveHandleStyle=/)
  assert.match(composed ?? '', /paddingTop: 28/)
  const nested = `${source.replace('<BottomSheet', '<View className="p-4"><BottomSheet').replace('/>', '/></View>')}\nimport {View} from '@hozo/core';`
  assert.match((await transformPartial(nested)) ?? '', /hozoInteractiveHandleStyle=/)
  const unproven = nested.replace('<View className="p-4">', '<View className="@sm:p-4">')
  assert.equal(await transformPartial(unproven), await worker.transform(unproven, file, f.root))

  const tracked = createCompiler({ ...transfer.snapshot.theme, preflight: true })
  const original = tracked.prepareNativeModule.bind(tracked)
  const records: { owner: boolean; contexts: unknown[]; disposed: number }[] = []
  tracked.prepareNativeModule = (input, ...rest) => {
    const module = original(input, ...rest)
    const row = { owner: input.includes('function Plan()'), contexts: [] as unknown[], disposed: 0 }
    records.push(row)
    return {
      ...module,
      emit(context) {
        row.contexts.push(context)
        return module.emit(context)
      },
      dispose() {
        row.disposed++
        module.dispose()
      },
    }
  }
  const cold = new MetroTailwindWorker(tracked, transfer)
  t.after(() => cold.invalidate())
  assert.match(
    (await cold.transformOwnerCaller(mixed, file, f.root, lease, request, 'prepared-partial')) ??
      '',
    /hozoInteractiveHandleStyle=/,
  )
  assert.equal(records.filter((r) => r.owner).length, 2)
  assert.equal(records.filter((r) => !r.owner).length, 1)
  assert.ok(
    records.every((r) => r.contexts.length === 1 && r.contexts[0] === records[0]!.contexts[0]),
  )
  assert.ok(
    records.every((r) => r.disposed === 1),
    'both ordinary and owner IR are released once',
  )
  writeFileSync(candidateModulePath(f.root), '// replaced')
  await assert.rejects(transformPartial(source), /RUNTIME_CHANGED/)
})

test('opt-in Metro transformer only prepares a caller captured by preflight', async (t) => {
  const f = fixture(t)
  const file = f.params.filename
  const source = `import {BottomSheet as Sheet} from '@hozo/patterns'; export const Row=()=> <Sheet open handleClassName="p-2 hover:opacity-50"/>`
  writeFileSync(file, source)
  const packageRoot = path.join(f.root, 'node_modules', '@hozo', 'patterns')
  mkdirSync(packageRoot, { recursive: true })
  const entry = path.join(packageRoot, 'index.js')
  writeFileSync(entry, 'export const BottomSheet = null')
  const pkg = {
    name: '@hozo/patterns',
    version: '1.0.0',
    main: './index.js',
    hozo: { manifest: 'owner.json' },
  }
  writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify(pkg))
  cpSync(
    new URL('../../patterns/hozo.manifest.json', import.meta.url),
    path.join(packageRoot, 'owner.json'),
  )
  const rootMetadata = path.join(f.root, 'package.json')
  const app = JSON.parse(readFileSync(rootMetadata, 'utf8'))
  app.dependencies['@hozo/patterns'] = '1.0.0'
  writeFileSync(rootMetadata, JSON.stringify(app))
  const context = {
    ...f.context,
    originModulePath: file,
    getPackageForModule(input: string) {
      if (path.relative(packageRoot, input) === 'index.js')
        return { rootPath: packageRoot, packageJson: pkg }
      return f.context.getPackageForModule(input)
    },
  }
  const preflight = collectMetroOwnerPreflight(context, f.delegate, {
    platform: 'android',
    epoch: 'metro-partial-transformer',
    origins: [file],
  })
  assert.equal(preflight.status, 'complete', JSON.stringify(preflight))
  const params = { ...f.params, src: source }
  await withHozoOwnerCandidates(f.config, preflight, f.options)
  const ordinaryKey = getCacheKey({ projectRoot: f.root })
  const ordinary = await transform(params)
  assert.doesNotMatch(String(ordinary), /hozoInteractiveHandleStyle/)
  const configured = await withHozoPartialOwners(f.config, preflight, f.options)
  assert.notEqual(getCacheKey({ projectRoot: f.root }), ordinaryKey)
  assert.equal(
    configured.resolver.resolveRequest(context, '@hozo/patterns', 'android').filePath,
    entry,
  )
  const output = await transform(params)
  assert.match(String(output), /handleClassName="p-2 hover:opacity-50" hozoInteractiveHandleStyle=/)
  assert.match(String(output), /from '@hozo\/patterns'/)
  assert.equal(
    await transform({ ...params, filename: path.join(f.root, 'src', 'Uncaptured.tsx') }),
    source,
  )
  await withHozo(f.config, f.options)
  assert.equal(readMetroState(f.root)?.ownerShadow, undefined)
  assert.equal(await transform(params), ordinary)
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
    withHozoOwnerCandidates(
      f.config,
      { status: 'incomplete', reason: 'untrusted', issues: ['missing'] },
      f.options,
    ),
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
    `import {clsx} from 'clsx';export function cn(...inputs){return clsx(inputs)}`,
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

test('fixture child output can trigger cancellation without blocking the parent or losing stderr', {
  timeout: 20000,
}, async (t) => {
  const f = fixture(t)
  const controller = new AbortController()
  const child = f.trackChild(
    fixtureNode(
      ['-e', "process.stderr.write('fixture-started');setInterval(()=>{},1000)"],
      f.root,
      { signal: AbortSignal.any([controller.signal, t.signal]), timeout: 0 },
    ),
  )
  child.child.stderr!.once('data', () => controller.abort())
  await assert.rejects(child, (error: Error & { stderr?: string }) => {
    assert.match(error.stderr ?? '', /fixture-started/)
    assert.equal(error.name, 'AbortError')
    return true
  })
  assert.ok(child.child.exitCode !== null || child.child.signalCode !== null)
})

test('owner cancellation closes fixture children before removing their cwd', {
  timeout: 10000,
}, async (t) => {
  const f = fixture(t)
  const receipt = path.join(f.root, 'cancelled-owner.json')
  const child = f.trackChild(
    fixtureNode(
      ['--test', fileURLToPath(new URL('../fixtures/owner-cancelled-child.mjs', import.meta.url))],
      f.root,
      {
        signal: t.signal,
        env: {
          ...process.env,
          // Run an independent test runner, not another worker of this one.
          NODE_TEST_CONTEXT: undefined,
          HOZO_METRO_FIXTURE_RECEIPT: receipt,
        },
      },
    ),
  )
  await assert.rejects(child, (error: Error & { code?: number }) => {
    assert.equal(error.code, 1, 'nested owner must report its intentional cancellation')
    return true
  })
  const observed = JSON.parse(readFileSync(receipt, 'utf8'))
  assert.equal(observed.closed, true)
  assert.equal(observed.removed, true)
  assert.match(observed.stderr, /fixture-started/)
})

test('a packed non-Hozo dependency supplies runtime candidates and opt-in Native owner delivery', {
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
  const run = async (args: string[], cwd: string) => {
    try {
      // CLI startup alone can consume the helper's 15 s cutoff (#2174).
      // Pack/install share this test's existing 30 s deadline via its signal;
      // neither command gets a new budget, and the helper still waits for close.
      return (
        await f.trackChild(
          fixtureNode([npm, ...args], cwd, {
            signal: t.signal,
            timeout: 0,
          }),
        )
      ).stdout
    } catch (error) {
      throw new Error(`Fixture npm ${args[0]} failed (no retry); see child output/cause`, {
        cause: error,
      })
    }
  }
  // Call the bundled CLI directly: no Windows .cmd wrapper, shell interpolation,
  // registry access, lifecycle execution, app build or repository install.
  const packed = JSON.parse(
    await run(
      [
        'pack',
        '--ignore-scripts',
        '--json',
        '--offline',
        '--cache',
        './npm-cache',
        '--loglevel=verbose',
      ],
      stage,
    ),
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
  await run(
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

  const caller = `import {FixturePanel as Panel} from 'acme-frozen-styles';
export const Row=()=> <Panel panelClassName="p-2" style={author.value}/>;`
  writeFileSync(f.params.filename, caller)
  const manifestOnly = { ...f.options, content: { include: ['src/**'] } }
  await withHozo(f.config, manifestOnly)
  assert.doesNotMatch(String(await transform({ ...params, src: caller })), /hozoFixturePanelStyle/)
  const captureCaller = (platform: string) =>
    collectMetroOwnerPreflight(f.context, f.delegate, {
      platform,
      epoch: 'packed-owner-caller',
      origins: [f.params.filename],
    })
  for (const platform of ['android', 'ios']) {
    const preflight = captureCaller(platform)
    assert.equal(preflight.status, 'complete', JSON.stringify(preflight))
    const config = await withHozoOwnerCallers(f.config, preflight, 'Toolbar.root', manifestOnly)
    const result = config.resolver.resolveRequest(
      { ...f.context, originModulePath: f.params.filename },
      'acme-frozen-styles',
      platform,
    )
    assert.equal(result.filePath, path.join(installed, `${platform}.js`))
    const input = { ...params, src: caller, options: { ...params.options, platform } }
    const output = String(await transform(input))
    assert.match(output, /hozoFixturePanelStyle=/)
    assert.match(output, /paddingTop:\s*14/)
    assert.doesNotMatch(output, /panelClassName="p-2"|hozoToolbarStyle/)
    assert.equal(output.split('author.value').length - 1, 1)
    const opaque = caller.replace('panelClassName="p-2"', 'panelClassName={classes}')
    const fallback = String(await transform({ ...input, src: opaque }))
    assert.match(fallback, /panelClassName=\{classes\}/)
    assert.doesNotMatch(fallback, /hozoFixturePanelStyle/)
  }
  // Keep the package, component, candidate list and caller; remove only the
  // owner declaration. A fresh capture must not infer a contract from the JSX.
  const manifestPath = path.join(installed, 'owner.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.owners = null
  for (const exported of manifest.exports) exported.owners = []
  writeFileSync(manifestPath, JSON.stringify(manifest))
  await withHozoOwnerCallers(f.config, captureCaller('android'), 'Toolbar.root', manifestOnly)
  assert.match(String(await transform({ ...params, src: caller })), /panelClassName="p-2"/)
})
