import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { ownerMetroFixture } from '../fixtures/owner-metro-resolver.mjs'
import { metroStatePath, readMetroState, withHozo, withHozoOwnerShadow } from './config.ts'
import { getCacheKey, transform } from './index.ts'
import { collectMetroOwnerPreflight } from './owner-manifest-preflight.ts'
import { candidateModulePath } from './project.ts'

function fixture(t) {
  const f = ownerMetroFixture(t)
  mkdirSync(path.join(f.root, 'src'))
  const source = `import {View} from '@hozo/core';export const A=()=> <View className="p-4"/>`
  const file = path.join(f.root, 'src', 'Row.tsx')
  writeFileSync(file, source)
  writeFileSync(path.join(f.root, 'global.css'), '@theme {--spacing:7px;} @tailwind utilities;')
  const upstream = path.join(f.root, 'upstream.cjs')
  writeFileSync(
    upstream,
    `module.exports={transform:async p=>{p.entered?.();if(p.wait)await p.wait;return p.src},getCacheKey:()=> 'upstream'}`,
  )
  const config = {
    projectRoot: f.root,
    resolver: { resolveRequest: f.delegate },
    transformer: { babelTransformerPath: upstream },
  }
  const options = { css: 'global.css', content: { packages: [] } }
  const preflight = () =>
    collectMetroOwnerPreflight(f.context, f.delegate, {
      platform: 'android',
      epoch: 'collector-label',
      origins: [f.context.originModulePath],
    })
  const params = {
    src: source,
    filename: file,
    options: { projectRoot: f.root, platform: 'android' },
  }
  return { ...f, config, options, preflight, params }
}
test('explicit shadow connects config, cache and real transform without changing legacy candidate/output bytes', {
  timeout: 10000,
}, async (t) => {
  const f = fixture(t)
  await withHozo(f.config, f.options)
  assert.equal(readMetroState(f.root)?.ownerShadow, undefined)
  const baselineKey = getCacheKey({ projectRoot: f.root })
  const baseline = await transform(f.params)
  const module = readFileSync(candidateModulePath(f.root), 'utf8')
  const guarded = await withHozoOwnerShadow(f.config, f.preflight(), f.options)
  const state = readMetroState(f.root)!
  assert.equal(state.ownerShadow?.mode, 'assessment-only')
  assert.notEqual(state.ownerShadow?.context, 'collector-label')
  assert.ok(!('routes' in state.ownerShadow!) && !('metadata' in state.ownerShadow!))
  assert.ok(
    readFileSync(metroStatePath(f.root), 'utf8').length < 6000,
    'state carries references, not a project graph',
  )
  assert.notEqual(getCacheKey({ projectRoot: f.root }), baselineKey)
  assert.equal(
    readFileSync(candidateModulePath(f.root), 'utf8'),
    module,
    'shadow does not install package-only candidates',
  )
  const resolution = guarded.resolver.resolveRequest(f.context, 'kit', 'android')
  assert.equal(resolution.filePath, path.join(f.first, 'android.js'))
  assert.equal(await transform(f.params), baseline)
  await assert.rejects(
    transform({ ...f.params, options: { ...f.params.options, platform: 'ios' } }),
    /platform has no preflight/,
  )
})
test('metadata, manifest or preflight record changed before startup fails cache-key/transform without fallback', {
  timeout: 10000,
}, async (t) => {
  for (const kind of ['metadata', 'manifest', 'record']) {
    const f = fixture(t)
    await withHozoOwnerShadow(f.config, f.preflight(), f.options)
    const file =
      kind === 'record'
        ? readMetroState(f.root)!.ownerShadow!.preflight.file
        : path.join(f.first, kind === 'metadata' ? 'package.json' : 'owner.json')
    writeFileSync(file, `${readFileSync(file, 'utf8')}\n`)
    assert.throws(
      () => getCacheKey({ projectRoot: f.root }),
      /metadata changed|source bytes changed|record hash mismatch/,
    )
    await assert.rejects(
      transform(f.params),
      /metadata changed|source bytes changed|record hash mismatch/,
    )
  }
})
test('an incomplete preflight fails before normal config or candidate state is published', {
  timeout: 10000,
}, async (t) => {
  const f = fixture(t)
  await assert.rejects(
    withHozoOwnerShadow(
      f.config,
      { status: 'incomplete', issues: ['unresolved dependency'] },
      f.options,
    ),
    /INCOMPLETE/,
  )
  assert.equal(existsSync(metroStatePath(f.root)), false)
  assert.equal(existsSync(candidateModulePath(f.root)), false)
  const other = fixture(t)
  await assert.rejects(
    withHozoOwnerShadow(f.config, other.preflight(), f.options),
    /excludes configured package root/,
  )
  assert.equal(existsSync(metroStatePath(f.root)), false)
  assert.equal(existsSync(candidateModulePath(f.root)), false)
})

test('unknown/changed successful resolution retires shadow work before actual upstream output delivery', {
  timeout: 10000,
}, async (t) => {
  const f = fixture(t),
    guarded = await withHozoOwnerShadow(f.config, f.preflight(), f.options)
  let entered: () => void = () => {},
    release: () => void = () => {}
  const started = new Promise<void>((resolve) => {
    entered = resolve
  })
  const wait = new Promise<void>((resolve) => {
    release = resolve
  })
  const pending = transform({ ...f.params, entered, wait })
  await started
  assert.throws(
    () =>
      guarded.resolver.resolveRequest(
        {
          ...f.context,
          resolveRequest: () => ({
            type: 'sourceFile',
            filePath: path.join(f.first, 'alternate.js'),
          }),
        },
        'kit',
        'android',
      ),
    /unassessed or changed/,
  )
  release()
  await assert.rejects(pending, /INVALIDATED/)
})
test('new capture invalidates suspended output and changes actual Metro cache identity', {
  timeout: 10000,
}, async (t) => {
  const f = fixture(t)
  await withHozoOwnerShadow(f.config, f.preflight(), f.options)
  const firstKey = getCacheKey({ projectRoot: f.root })
  let entered: () => void = () => {},
    release: () => void = () => {}
  const started = new Promise<void>((resolve) => {
    entered = resolve
  })
  const wait = new Promise<void>((resolve) => {
    release = resolve
  })
  const pending = transform({ ...f.params, entered, wait })
  await started
  const file = path.join(f.first, 'owner.json'),
    data = JSON.parse(readFileSync(file, 'utf8'))
  data.candidates.push('p-8')
  writeFileSync(file, JSON.stringify(data))
  await withHozoOwnerShadow(f.config, f.preflight(), f.options)
  assert.notEqual(getCacheKey({ projectRoot: f.root }), firstKey)
  release()
  await assert.rejects(pending, /INVALIDATED/)
  assert.equal(typeof (await transform(f.params)), 'string')
})
