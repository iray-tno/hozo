import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  assertOwnerManifestCaptureCurrent,
  captureOwnerManifests,
} from './owner-manifest-capture.ts'
import { readResolvedOwnerManifest } from './owner-manifest-read.ts'

const text = readFileSync(
  new URL('../../../scripts/style-slots/owner-shadow.json', import.meta.url),
  'utf8',
)
function json(file, data) {
  writeFileSync(file, `${JSON.stringify(data)}\n`)
}
function makePackage(dir, name, version, dependencies = {}, participant = true) {
  mkdirSync(dir, { recursive: true })
  const metadata = {
    name,
    version,
    dependencies,
    exports: { 'react-native': './native.cjs', browser: './web.cjs', default: './web.cjs' },
    ...(participant ? { hozo: { manifest: 'owner.json' } } : {}),
  }
  json(path.join(dir, 'package.json'), metadata)
  for (const file of ['native.cjs', 'web.cjs'])
    writeFileSync(path.join(dir, file), 'throw new Error("resolver must not import entry")')
  if (participant) writeFileSync(path.join(dir, 'owner.json'), text)
}
function fixture(t) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'hozo-owner-resolver-')))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  json(path.join(root, 'package.json'), {
    name: 'fixture-app',
    dependencies: { 'fixture-bridge': '1', 'fixture-widget': '1', 'fixture-ordinary': '1' },
  })
  writeFileSync(path.join(root, 'App.cjs'), 'throw new Error("app must not execute")')
  const bridge = path.join(root, 'node_modules/fixture-bridge')
  const first = path.join(root, 'node_modules/fixture-widget')
  const second = path.join(bridge, 'node_modules/fixture-widget')
  makePackage(bridge, 'fixture-bridge', '1.0.0', { 'fixture-widget': '2' }, false)
  makePackage(first, 'fixture-widget', '1.0.0')
  makePackage(second, 'fixture-widget', '2.0.0', { 'fixture-bridge': '1' })
  makePackage(
    path.join(root, 'node_modules/fixture-ordinary'),
    'fixture-ordinary',
    '1.0.0',
    {},
    false,
  )
  return { root, bridge, first, second }
}
function observe(root, platform) {
  const driver = fileURLToPath(new URL('../fixtures/owner-manifest-resolve.mjs', import.meta.url))
  const graph = JSON.parse(
    execFileSync(
      process.execPath,
      [`--conditions=${platform === 'web' ? 'browser' : 'react-native'}`, driver, root],
      { encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '' }, timeout: 10000 },
    ),
  )
  const expected = graph.edges.map(({ importer, specifier }) => ({ importer, specifier }))
  const observations = graph.edges.map((row) =>
    row.reason
      ? {
          importer: row.importer,
          specifier: row.specifier,
          status: 'unresolved',
          reason: row.reason,
        }
      : readResolvedOwnerManifest(row, row),
  )
  return {
    graph,
    expected,
    observations,
    capture: captureOwnerManifests(expected, observations, { platform, epoch: 'fixture-epoch' }),
  }
}

test('actual importer-relative resolution preserves two non-Hozo versions, transitive/cyclic edges and platform entries', (t) => {
  const { root, first, second } = fixture(t)
  const results = ['web', 'native'].map((platform) => observe(root, platform))
  for (const [index, result] of results.entries()) {
    assert.equal(result.graph.edges.length, 5)
    assert.equal(
      result.graph.instances.length,
      5,
      'app plus four dependency instances, with cycle bounded',
    )
    assert.equal(result.capture.status, 'complete')
    if (result.capture.status !== 'complete') continue
    const widgets = result.capture.bindings.filter(
      (binding) => binding.specifier === 'fixture-widget',
    )
    assert.deepEqual(new Set(widgets.map((binding) => binding.instance)), new Set([first, second]))
    assert.ok(
      widgets.every((binding) => binding.entry.endsWith(index === 0 ? 'web.cjs' : 'native.cjs')),
    )
    assert.ok(
      widgets.every((binding) => binding.manifest!.shadow.contracts[0]!.audit === 'unknown'),
    )
    assert.equal(result.capture.bindings.filter((binding) => binding.manifest === null).length, 3)
  }
  assert.notDeepEqual(results[0]!.capture, results[1]!.capture)
})

test('fresh observations after content/entry replacement invalidate frozen capture, unlike version labels alone', (t) => {
  const { root, second } = fixture(t)
  const first = observe(root, 'native').capture
  assertOwnerManifestCaptureCurrent(first, observe(root, 'native').capture)
  const metadataFile = path.join(second, 'package.json'),
    metadata = JSON.parse(readFileSync(metadataFile, 'utf8'))
  metadata.version = '2.0.1'
  json(metadataFile, metadata)
  assertOwnerManifestCaptureCurrent(first, observe(root, 'native').capture)
  writeFileSync(path.join(second, 'owner.json'), `${text}\n`)
  const changed = observe(root, 'native').capture
  assert.throws(() => assertOwnerManifestCaptureCurrent(first, changed), /INVALIDATED/)
  writeFileSync(path.join(second, 'owner.json'), text)
  assertOwnerManifestCaptureCurrent(first, observe(root, 'native').capture)
  writeFileSync(path.join(second, 'alternate.cjs'), 'throw new Error("must not import")')
  metadata.exports['react-native'] = './alternate.cjs'
  json(metadataFile, metadata)
  assert.throws(
    () => assertOwnerManifestCaptureCurrent(first, observe(root, 'native').capture),
    /INVALIDATED/,
  )
})

test('late contributions and promised missing manifests cannot reuse the earlier frozen set', (t) => {
  const { root, second } = fixture(t)
  const first = observe(root, 'native')
  const metadataFile = path.join(root, 'package.json'),
    metadata = JSON.parse(readFileSync(metadataFile, 'utf8'))
  metadata.dependencies['fixture-late'] = '1'
  json(metadataFile, metadata)
  makePackage(path.join(root, 'node_modules/fixture-late'), 'fixture-late', '1.0.0')
  const late = observe(root, 'native')
  assert.equal(late.graph.edges.length, 6)
  assert.throws(() => assertOwnerManifestCaptureCurrent(first.capture, late.capture), /INVALIDATED/)
  const incomplete = captureOwnerManifests(first.expected, late.observations, {
    platform: 'native',
    epoch: 'fixture-epoch',
  })
  assert.equal(incomplete.status, 'incomplete')
  assert.throws(() => assertOwnerManifestCaptureCurrent(first.capture, incomplete), /INVALIDATED/)
  rmSync(path.join(second, 'owner.json'))
  const missing = observe(root, 'native').capture
  assert.equal(missing.status, 'incomplete')
  assert.ok(!('bindings' in missing) && !('fingerprint' in missing))
  assert.throws(() => assertOwnerManifestCaptureCurrent(late.capture, missing), /INVALIDATED/)
  if (first.capture.status === 'complete')
    assert.equal(first.capture.bindings.length, 5, 'earlier snapshot never mutates')
})
