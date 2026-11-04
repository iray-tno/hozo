import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { ownerMetroFixture } from '../fixtures/owner-metro-resolver.mjs'
import { observeMetroOwnerPreflight } from './owner-preflight-observer.ts'

test('observe only the exact platform and live edge, and attempt the closure once', (t) => {
  const f = ownerMetroFixture(t)
  const importer = f.context.originModulePath
  const observer = observeMetroOwnerPreflight(
    { importer, specifier: 'kit' },
    { origins: [importer], platform: 'android', epoch: 'observe' },
  )
  let calls = 0
  const delegate = (...args) => {
    calls++
    return f.delegate(...args)
  }
  observer.resolve(f.context, 'kit', 'ios', delegate)
  observer.resolve(f.context, 'bridge', 'android', delegate)
  assert.equal(observer.result(), undefined)
  assert.equal(calls, 2)
  const result = observer.resolve(f.context, 'kit', 'android', delegate)
  assert.equal(result.filePath, path.join(f.first, 'android.js'))
  const observed = observer.result()
  assert.equal(observed?.status, 'complete', JSON.stringify(observed))
  if (observed?.status !== 'complete') return
  assert.equal(observed.routes.length, 5)
  assert.equal(calls, 8)
  observer.resolve(f.context, 'kit', 'android', delegate)
  assert.equal(calls, 9)
  assert.equal(observer.result(), observed)
})

test('disagreement with the live edge keeps the resolver result but exposes no owner seed', (t) => {
  const f = ownerMetroFixture(t)
  const importer = f.context.originModulePath
  const observer = observeMetroOwnerPreflight(
    { importer, specifier: 'kit' },
    { origins: [importer], platform: 'android', epoch: 'disagreement' },
  )
  const first = { type: 'sourceFile', filePath: path.join(f.first, 'alternate.js') }
  let next = first
  const result = observer.resolve(f.context, 'kit', 'android', (...args) => {
    if (next) {
      const resolved = next
      next = undefined
      return resolved
    }
    return f.delegate(...args)
  })
  assert.equal(result, first)
  assert.deepEqual(observer.result(), {
    status: 'incomplete',
    reason: 'untrusted',
    issues: ['Metro owner preflight disagrees with the live resolver edge'],
  })
})
