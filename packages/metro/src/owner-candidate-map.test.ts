import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { openCandidateCache } from '@hozo/compiler'
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
