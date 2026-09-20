import assert from 'node:assert/strict'
import test from 'node:test'

import {
  bootstrapPlan,
  registryEntry,
  resolveCrateTarget,
  resolveNpmTarget,
} from './bootstrap-publish.mjs'

const workspace = [
  {
    directory: '/repo/packages/new-package',
    json: { name: '@hozo/new-package', version: '0.1.0' },
  },
  {
    directory: '/repo/packages/test-reporter',
    json: { name: '@hozo/test-reporter', version: '0.0.0', private: true },
  },
]

test('an intended public workspace package is a bootstrap target', () => {
  // Use an existing generated package directory: the public-package allowlist
  // is deliberately independent of the caller's invented fixture names.
  const target = resolveNpmTarget('@hozo/core')
  assert.equal(target.kind, 'workspace')
  assert.equal(target.path, 'packages/core')
})

test('private and unknown npm names are refused', () => {
  assert.throws(
    () => resolveNpmTarget('@hozo/test-reporter', workspace, []),
    /private and cannot be published/,
  )
  assert.throws(() => resolveNpmTarget('@hozo/missing', workspace, []), /not a package declared/)
})

test('a declared native target carries the runner and triple into the plan', () => {
  const target = resolveNpmTarget(
    '@hozo/compiler-new-platform',
    [],
    [
      {
        packageName: '@hozo/compiler-new-platform',
        triple: 'new-platform',
        runner: 'ubuntu-latest',
        libc: 'musl',
      },
    ],
  )
  assert.deepEqual(
    {
      kind: target.kind,
      triple: target.triple,
      runner: target.runner,
      musl: target.musl,
    },
    { kind: 'native', triple: 'new-platform', runner: 'ubuntu-latest', musl: true },
  )
  assert.equal(target.artifact, 'compiler-new-platform')
})

test('only publishable workspace crates are admitted', () => {
  const metadata = {
    packages: [
      {
        name: 'hozo_new',
        version: '0.1.0',
        publish: null,
        manifest_path: '/repo/crates/hozo_new/Cargo.toml',
      },
      {
        name: 'hozo_binding',
        version: '0.1.0',
        publish: [],
        manifest_path: '/repo/crates/hozo_binding/Cargo.toml',
      },
    ],
  }
  assert.equal(resolveCrateTarget('hozo_new', metadata).kind, 'crate')
  assert.throws(() => resolveCrateTarget('hozo_binding', metadata), /publish = false/)
  assert.throws(() => resolveCrateTarget('hozo_missing', metadata), /not a crate declared/)
})

test('registry lookup distinguishes a missing name from an outage', async () => {
  const plan = { registry: 'npm', name: '@hozo/new-package' }
  assert.equal(await registryEntry(plan, async () => ({ status: 404, ok: false })), undefined)
  await assert.rejects(
    registryEntry(plan, async () => ({ status: 503, ok: false })),
    /failed with 503/,
  )
})

test('bootstrap refuses a name the registry already owns', async () => {
  await assert.rejects(
    bootstrapPlan('npm', '@hozo/core', {
      fetch: async () => ({
        status: 200,
        ok: true,
        json: async () => ({ 'dist-tags': { latest: '0.1.0' } }),
      }),
    }),
    /already exists.*bootstrap credentials may only create names/,
  )
})
