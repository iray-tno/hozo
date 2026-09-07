import assert from 'node:assert/strict'
import test from 'node:test'

import { createNavigationAdapter, isLocalHref } from './adapter.ts'

test('the default route boundary accepts local references and declines URLs with an authority', () => {
  for (const href of [
    '/products/42',
    './settings',
    '../account',
    'checkout',
    '?tab=billing',
    '#details',
  ]) {
    assert.equal(isLocalHref(href), true, href)
  }
  for (const href of [
    'https://example.com',
    '//cdn.example.com/file',
    'mailto:hi@example.com',
    'myapp://home',
    '',
  ]) {
    assert.equal(isLocalHref(href), false, href)
  }
})

test('an accepted navigation is handed to the application router', async () => {
  const seen: string[] = []
  const adapter = createNavigationAdapter({
    onNavigate(href) {
      seen.push(href)
    },
  })

  assert.equal(await adapter.navigate({ href: '/account' }), true)
  assert.deepEqual(seen, ['/account'])
})

test('a custom route boundary can own absolute universal links', async () => {
  const adapter = createNavigationAdapter({
    shouldHandle: (href) => href.startsWith('https://app.example.com/'),
    onNavigate: () => true,
  })

  assert.equal(await adapter.navigate({ href: 'https://app.example.com/orders/1' }), true)
  assert.equal(await adapter.navigate({ href: '/orders/1' }), false)
})

test('external and explicitly declined navigation retain the platform fallback', async () => {
  const adapter = createNavigationAdapter({ onNavigate: () => false })
  assert.equal(await adapter.navigate({ href: '/declined' }), false)
  assert.equal(await adapter.navigate({ href: '/external', external: true }), false)
})

test('prefetch follows the same route boundary without affecting navigation', async () => {
  const seen: string[] = []
  const adapter = createNavigationAdapter({
    onNavigate: () => true,
    onPrefetch: (href) => seen.push(href),
  })

  await adapter.prefetch?.({ href: '/likely' })
  await adapter.prefetch?.({ href: 'https://example.com' })
  await adapter.prefetch?.({ href: '/outside', external: true })
  assert.deepEqual(seen, ['/likely'])
})
