import assert from 'node:assert/strict'
import test from 'node:test'

import withHozoLinks from './expo-config.ts'

test('adds the two-sided Expo app configuration for associated domains', () => {
  const configured = withHozoLinks(
    { name: 'Example', scheme: 'existing', ios: { supportsTablet: true } },
    {
      scheme: 'myapp',
      domains: [
        { host: 'App.Example.com', pathPrefixes: ['/products', '/products'] },
        'links.example.com',
      ],
    },
  )

  assert.deepEqual(configured.scheme, ['existing', 'myapp'])
  assert.deepEqual(configured.ios, {
    supportsTablet: true,
    associatedDomains: ['applinks:app.example.com', 'applinks:links.example.com'],
  })
  assert.deepEqual(configured.android?.intentFilters, [
    {
      action: 'VIEW',
      autoVerify: true,
      data: [{ scheme: 'https', host: 'app.example.com', pathPrefix: '/products' }],
      category: ['BROWSABLE', 'DEFAULT'],
    },
    {
      action: 'VIEW',
      autoVerify: true,
      data: [{ scheme: 'https', host: 'links.example.com' }],
      category: ['BROWSABLE', 'DEFAULT'],
    },
  ])
})

test('is idempotent and preserves unrelated existing config', () => {
  const options = { scheme: 'myapp', domains: ['app.example.com'] }
  const once = withHozoLinks({ android: { package: 'com.example.app' } }, options)
  const twice = withHozoLinks(once, options)
  assert.deepEqual(twice, once)
})

test('rejects deployment values Expo cannot use', () => {
  assert.throws(() => withHozoLinks({}, {}), /requires/)
  assert.throws(() => withHozoLinks({}, { domains: [] }), /requires/)
  assert.throws(() => withHozoLinks({}, { scheme: 'not a scheme' }), /URL scheme/)
  assert.throws(
    () => withHozoLinks({}, { domains: ['https://example.com/path'] }),
    /Invalid associated host/,
  )
  assert.throws(
    () => withHozoLinks({}, { domains: [{ host: 'example.com', pathPrefixes: ['products'] }] }),
    /must start with/,
  )
})
