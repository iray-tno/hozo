import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { packArguments, publicationOrder } from './pack-npm.mjs'
import { PACKAGE_NAMES } from './package-metadata.mjs'

test('the pack command selects one named public package and an exact output', () => {
  assert.deepEqual(packArguments('core', '/tmp/hozo-core-0.1.0.tgz'), [
    '--filter',
    '@hozo/core',
    'pack',
    '--out',
    '/tmp/hozo-core-0.1.0.tgz',
  ])
})

test('packages are published after their workspace dependencies', () => {
  const manifests = [
    { name: '@hozo/core', dependencies: { '@hozo/primitives': 'workspace:^' } },
    { name: '@hozo/primitives', dependencies: { '@hozo/engine': 'workspace:^' } },
    { name: '@hozo/engine' },
  ]
  assert.deepEqual(publicationOrder(['core', 'primitives', 'engine'], manifests), [
    'engine',
    'primitives',
    'core',
  ])
})

test('the public release publishes UI after all its Hozo dependencies', () => {
  const manifests = PACKAGE_NAMES.map((name) =>
    JSON.parse(readFileSync(new URL(`../packages/${name}/package.json`, import.meta.url), 'utf8')),
  )
  const order = publicationOrder(PACKAGE_NAMES, manifests)
  const ui = manifests.find((manifest) => manifest.name === '@hozo/ui')
  assert.ok(ui)
  assert.ok(order.includes('ui'))
  for (const dependency of Object.keys(ui.dependencies)) {
    assert.ok(order.indexOf(dependency.replace('@hozo/', '')) >= 0)
    assert.ok(order.indexOf(dependency.replace('@hozo/', '')) < order.indexOf('ui'))
  }
})
