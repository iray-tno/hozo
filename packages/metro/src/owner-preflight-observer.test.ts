import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { ownerMetroFixture } from '../fixtures/owner-metro-resolver.mjs'
import { observeMetroOwnerPreflight } from './owner-preflight-observer.ts'

test('observe only the exact platform and live edge, and attempt the closure once', async (t) => {
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
  const { output, preflight: observed } = await observer.run(async (resolve) => {
    resolve(f.context, 'kit', 'ios', delegate)
    resolve(f.context, 'bridge', 'android', delegate)
    assert.equal(calls, 2)
    const result = resolve(f.context, 'kit', 'android', delegate)
    assert.equal(calls, 8)
    resolve(f.context, 'kit', 'android', delegate)
    assert.equal(calls, 9)
    return result
  })
  assert.equal(output.filePath, path.join(f.first, 'android.js'))
  assert.equal(observed?.status, 'complete', JSON.stringify(observed))
  if (observed?.status !== 'complete') return
  assert.equal(observed.routes.length, 5)
})

test('disagreement with the live edge keeps the resolver result but exposes no owner seed', async (t) => {
  const f = ownerMetroFixture(t)
  const importer = f.context.originModulePath
  const observer = observeMetroOwnerPreflight(
    { importer, specifier: 'kit' },
    { origins: [importer], platform: 'android', epoch: 'disagreement' },
  )
  const first = { type: 'sourceFile', filePath: path.join(f.first, 'alternate.js') }
  let initial = true
  const { output, preflight } = await observer.run(async (resolve) =>
    resolve(f.context, 'kit', 'android', (...args) => {
      if (initial) {
        initial = false
        return first
      }
      return f.delegate(...args)
    }),
  )
  assert.equal(output, first)
  assert.deepEqual(preflight, {
    status: 'incomplete',
    reason: 'untrusted',
    issues: ['Metro owner preflight disagrees with the live resolver edge'],
  })
})

test('a failed ordinary build cannot return or reuse an already collected capture', async (t) => {
  const f = ownerMetroFixture(t)
  const importer = f.context.originModulePath
  const observer = observeMetroOwnerPreflight(
    { importer, specifier: 'kit' },
    { origins: [importer], platform: 'android', epoch: 'failed-build' },
  )
  const failure = new Error('ordinary bundle failed after resolution')
  await assert.rejects(
    observer.run(async (resolve) => {
      resolve(f.context, 'kit', 'android', f.delegate)
      throw failure
    }),
    (error) => error === failure,
  )
  await assert.rejects(
    observer.run(async () => null),
    /requires a fresh build/,
  )
})
