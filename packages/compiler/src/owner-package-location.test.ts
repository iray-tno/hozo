import assert from 'node:assert/strict'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { locateResolvedOwnerPackage } from './owner-package-location.ts'

function fixture(t) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'hozo-owner-location-')))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ hozo: { manifest: 'app-owner.json' } }),
  )
  const entry = (dir, metadata = {}) => {
    mkdirSync(path.join(dir, 'dist'), { recursive: true })
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify(metadata))
    const file = path.join(dir, 'dist/index.js')
    writeFileSync(file, 'throw new Error("resolved entries must not execute")')
    return file
  }
  return { root, entry }
}

test('physical ownership separates same-name installations and records absent nearer metadata', (t) => {
  const { root, entry } = fixture(t)
  for (const suffix of ['node_modules/kit', 'node_modules/bridge/node_modules/kit']) {
    const packageRoot = path.join(root, suffix)
    const file = entry(packageRoot, {
      name: 'kit',
      version: '1.0.0',
      hozo: { manifest: 'owner.json' },
    })
    const result = locateResolvedOwnerPackage(file)
    assert.equal(result.status, 'resolved')
    if (result.status !== 'resolved') throw new Error(result.reason)
    assert.deepEqual(result.instance, { packageRoot, entry: file, declaredManifest: 'owner.json' })
    assert.equal(result.boundaries.length, 2)
    assert.deepEqual(result.boundaries[0], {
      file: path.join(packageRoot, 'dist/package.json'),
      sha256: null,
    })
    assert.match(result.boundaries[1]!.sha256!, /^[a-f0-9]{64}$/)
    assert.ok(Object.isFrozen(result.instance) && Object.isFrozen(result.boundaries))
  }
})

test('ordinary nested package metadata never borrows a parent Hozo declaration', (t) => {
  const { root, entry } = fixture(t)
  const packageRoot = path.join(root, 'node_modules/plain')
  const file = entry(packageRoot, { name: 'plain' })
  const result = locateResolvedOwnerPackage(file)
  assert.equal(result.status, 'resolved')
  if (result.status === 'resolved') assert.equal(result.instance.declaredManifest, null)
  rmSync(path.join(packageRoot, 'package.json'))
  assert.deepEqual(locateResolvedOwnerPackage(file), {
    status: 'unresolved',
    reason: 'package-metadata-missing',
  })
})

test('malformed/oversized/non-file metadata and invalid declarations cannot fall back to an ancestor', (t) => {
  const { root, entry } = fixture(t)
  const packageRoot = path.join(root, 'node_modules/kit')
  const file = entry(packageRoot)
  const metadata = path.join(packageRoot, 'package.json')
  for (const text of [
    '{',
    'null',
    '[]',
    '{"hozo":null}',
    '{"hozo":{"manifest":null}}',
    '{"hozo":{"manifest":3}}',
    ' '.repeat(65_537),
  ]) {
    writeFileSync(metadata, text)
    assert.equal(locateResolvedOwnerPackage(file).status, 'unresolved')
  }
  rmSync(metadata)
  mkdirSync(metadata)
  assert.equal(locateResolvedOwnerPackage(file).status, 'unresolved')
  for (const value of ['virtual:kit', `${file}?raw`, `${file}#x`, `${file}\0`, path.dirname(file)])
    assert.equal(locateResolvedOwnerPackage(value).status, 'unresolved')
})

test('directory links resolve to the physical installation, and new boundaries are observed fresh', (t) => {
  const { root, entry } = fixture(t)
  const physical = path.join(root, 'store/kit')
  const file = entry(physical, { hozo: { manifest: 'owner.json' } })
  const link = path.join(root, 'linked')
  symlinkSync(physical, link, process.platform === 'win32' ? 'junction' : 'dir')
  const result = locateResolvedOwnerPackage(path.join(link, 'dist/index.js'))
  assert.equal(result.status, 'resolved')
  if (result.status === 'resolved') assert.equal(result.instance.packageRoot, physical)
  writeFileSync(path.join(physical, 'dist/package.json'), '{}')
  const changed = locateResolvedOwnerPackage(file)
  assert.equal(changed.status, 'resolved')
  if (changed.status === 'resolved') {
    assert.equal(changed.instance.packageRoot, path.dirname(file))
    assert.equal(changed.instance.declaredManifest, null)
  }
  assert.equal(readFileSync(file, 'utf8'), 'throw new Error("resolved entries must not execute")')
})
