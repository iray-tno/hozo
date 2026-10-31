import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { ownerMetroFixture } from '../fixtures/owner-metro-resolver.mjs'
import {
  assertMetroOwnerPreflightCurrent,
  collectMetroOwnerPreflight,
} from './owner-manifest-preflight.ts'
import {
  MetroOwnerManifestWorker,
  writeMetroOwnerManifestTransfer,
} from './owner-manifest-transfer.ts'

test('actual Metro resolver preserves importer instances, platform exports, cycles and participant candidates', (t) => {
  const f = ownerMetroFixture(t)
  for (const platform of ['android', 'ios']) {
    const result = collectMetroOwnerPreflight(f.context, f.delegate, {
      platform,
      epoch: 'real-resolver-test',
      origins: [f.context.originModulePath],
    })
    assert.equal(result.status, 'complete', JSON.stringify(result))
    if (result.status !== 'complete') continue
    assert.equal(result.routes.length, 5)
    assert.deepEqual(
      new Set(result.routes.filter((row) => row.specifier === 'kit').map((row) => row.instance)),
      new Set([f.first, f.second]),
    )
    assert.ok(result.routes.every((row) => row.entry.endsWith(`${platform}.js`)))
    const ref = writeMetroOwnerManifestTransfer(f.root, result.request)
    const worker = new MetroOwnerManifestWorker(ref, { platform, epoch: 'real-resolver-test' })
    assert.deepEqual(worker.contributions.candidates, ['p-2', 'p-4'])
    assert.equal(worker.contributions.instances.length, 2)
    assert.doesNotThrow(() => assertMetroOwnerPreflightCurrent(result))
  }
})
test('configured resolver overrides and fresh conditional-entry replacement affect preflight identity', (t) => {
  const f = ownerMetroFixture(t),
    options = { platform: 'android', epoch: 'test', origins: [f.context.originModulePath] }
  const first = collectMetroOwnerPreflight(f.context, f.delegate, options)
  if (first.status !== 'complete') throw new Error(JSON.stringify(first))
  const custom = collectMetroOwnerPreflight(
    f.context,
    (ctx, name, platform) => {
      if (name === 'kit' && path.dirname(ctx.originModulePath) === f.bridge)
        return { type: 'sourceFile', filePath: path.join(f.second, 'alternate.js') }
      return f.delegate(ctx, name, platform)
    },
    options,
  )
  assert.equal(custom.status, 'complete')
  if (custom.status === 'complete') assert.notEqual(custom.fingerprint, first.fingerprint)
  const file = path.join(f.second, 'package.json'),
    json = JSON.parse(readFileSync(file, 'utf8'))
  json.exports['.'].android = './alternate.js'
  writeFileSync(file, JSON.stringify(json))
  assert.throws(() => assertMetroOwnerPreflightCurrent(first), /metadata changed/)
  const next = collectMetroOwnerPreflight(f.context, f.delegate, options)
  assert.equal(next.status, 'complete')
  if (next.status === 'complete')
    assert.ok(next.routes.some((row) => row.entry.endsWith('alternate.js')))
})
test('an actually unresolved declared optional package yields no partial transfer seed', (t) => {
  const f = ownerMetroFixture(t),
    file = path.join(f.root, 'package.json')
  const json = JSON.parse(readFileSync(file, 'utf8'))
  json.optionalDependencies = { 'not-installed': '1' }
  writeFileSync(file, JSON.stringify(json))
  const result = collectMetroOwnerPreflight(f.context, f.delegate, {
    platform: 'android',
    epoch: 'test',
    origins: [f.context.originModulePath],
  })
  assert.equal(result.status, 'incomplete')
  assert.ok(!('request' in result))
})
