import assert from 'node:assert/strict'
import test from 'node:test'

import { packArguments, publicationOrder } from './pack-npm.mjs'

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
