import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  assertMetroOwnerPreflightCurrent,
  collectMetroOwnerPreflight,
} from './owner-manifest-preflight.ts'

function fixture(t) {
  const root = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'hozo-owner-closure-')))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const packages = ['app', 'bridge', 'first', 'second', 'ordinary'].map((name) =>
    path.join(root, name),
  )
  const dependencies = [
    { kit: '1', bridge: '1', ordinary: '1' },
    { kit: '2' },
    {},
    { bridge: '1' },
    {},
  ]
  for (const [index, dir] of packages.entries()) {
    mkdirSync(dir)
    writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ dependencies: dependencies[index] }),
    )
    writeFileSync(path.join(dir, 'entry.js'), 'throw new Error("must not execute")')
  }
  const app = path.join(packages[0], 'entry.js')
  const context = {
    originModulePath: app,
    getPackageForModule: (entry) => {
      const rootPath = packages.find((root) => path.dirname(entry) === root)
      return rootPath ? { rootPath } : null
    },
  }
  const calls: { from: string; name: string; platform: string }[] = []
  const delegate = (ctx, name, platform) => {
    calls.push({ from: ctx.originModulePath, name, platform })
    const index =
      name === 'bridge'
        ? 1
        : name === 'ordinary'
          ? 4
          : path.dirname(ctx.originModulePath) === packages[1]
            ? 3
            : 2
    return { type: 'sourceFile', filePath: path.join(packages[index], 'entry.js') }
  }
  const options = { origins: [app], platform: 'android', epoch: 'test' }
  return { root, packages, context, delegate, options, calls }
}
test('resolver-backed declaration closure visits cycles once, preserves two instances and original context', (t) => {
  const f = fixture(t),
    result = collectMetroOwnerPreflight(f.context, f.delegate, f.options)
  assert.equal(result.status, 'complete')
  if (result.status !== 'complete') return
  assert.equal(result.routes.length, 5)
  assert.equal(result.metadata.length, 5)
  assert.equal(f.calls.length, 5)
  assert.ok(f.calls.every((call) => call.platform === 'android'))
  assert.equal(f.context.originModulePath, f.options.origins[0])
  assert.deepEqual(
    new Set(result.routes.filter((row) => row.specifier === 'kit').map((row) => row.instance)),
    new Set([f.packages[2], f.packages[3]]),
  )
  assert.ok(Object.isFrozen(result.routes[0]))
  const seed = JSON.parse(result.request)
  assert.equal(seed.expected.length, seed.resolutions.length)
  assert.doesNotThrow(() => assertMetroOwnerPreflightCurrent(result))
})
test('missing context, unsupported resolutions and bounded closures never expose a partial seed', (t) => {
  const f = fixture(t)
  for (const result of [
    collectMetroOwnerPreflight(
      { originModulePath: f.context.originModulePath },
      f.delegate,
      f.options,
    ),
    collectMetroOwnerPreflight(f.context, () => ({ type: 'empty' }), f.options),
    collectMetroOwnerPreflight(
      f.context,
      () => {
        throw new Error('not installed optional peer')
      },
      f.options,
    ),
    collectMetroOwnerPreflight(f.context, f.delegate, { ...f.options, maxEdges: 1 }),
    collectMetroOwnerPreflight(f.context, f.delegate, { ...f.options, maxPackages: 1 }),
  ]) {
    assert.equal(result.status, 'incomplete')
    assert.ok(!('request' in result) && !('routes' in result))
  }
})
test('metadata replacement during or after collection invalidates preflight adoption', (t) => {
  const f = fixture(t),
    result = collectMetroOwnerPreflight(f.context, f.delegate, f.options)
  if (result.status !== 'complete') throw new Error('fixture')
  const file = path.join(f.packages[0], 'package.json')
  const original = readFileSync(file, 'utf8')
  writeFileSync(file, `${original}\n`)
  assert.throws(() => assertMetroOwnerPreflightCurrent(result), /metadata changed/)
  writeFileSync(file, original)
  const changed = collectMetroOwnerPreflight(
    f.context,
    (ctx, name, platform) => {
      writeFileSync(file, `${original}\n`)
      return f.delegate(ctx, name, platform)
    },
    f.options,
  )
  assert.equal(changed.status, 'incomplete')
})
