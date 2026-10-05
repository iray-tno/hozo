import assert from 'node:assert/strict'
import test from 'node:test'
import { consumerClosure, consumerEnvironment } from './check-packed-consumer.mjs'
import { mapSources } from './fixtures/packed-consumer/native/map-sources.mjs'

test('consumer closure packs transitive packages without adding them as app dependencies', () => {
  const manifests = new Map([
    ['core', { dependencies: { '@hozo/primitives': 'workspace:^', react: '^19' } }],
    ['primitives', { dependencies: { '@hozo/engine': 'workspace:^' } }],
    ['engine', {}],
  ])
  assert.deepEqual(consumerClosure(['core'], manifests), ['core', 'engine', 'primitives'])
  assert.throws(() => consumerClosure(['missing'], manifests), /not an installable/)
  manifests.set('engine', { private: true })
  assert.throws(() => consumerClosure(['core'], manifests), /not an installable/)
})

test('a cyclic manifest walk terminates', () => {
  assert.deepEqual(
    consumerClosure(
      ['a'],
      new Map([
        ['a', { dependencies: { '@hozo/b': 'workspace:^' } }],
        ['b', { dependencies: { '@hozo/a': 'workspace:^' } }],
      ]),
    ),
    ['a', 'b'],
  )
})

test('consumer subprocesses cannot borrow a development binding or global module path', () => {
  const original = {
    PATH: '/bin',
    NODE_PATH: '/repo/node_modules',
    HOZO_NATIVE_BINDING: '/repo/dev.node',
    node_options: '--conditions=react-native',
  }
  assert.deepEqual(consumerEnvironment(original), { PATH: '/bin' })
  assert.ok(original.NODE_PATH)
})

test('bundle checks inspect flat and recursively indexed Metro source maps', () => {
  assert.deepEqual(mapSources({ sources: ['a.js'] }), ['a.js'])
  assert.deepEqual(
    mapSources({
      sections: [
        { map: { sources: ['a.js'] } },
        { map: { sections: [{ map: { sources: ['b.js'] } }] } },
      ],
    }),
    ['a.js', 'b.js'],
  )
  assert.throws(() => mapSources({ sections: [{ url: 'external.map' }] }))
})
