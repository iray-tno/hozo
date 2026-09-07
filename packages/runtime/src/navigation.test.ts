import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  activateHozoNavigation,
  type HozoNavigationAdapter,
  prefetchHozoNavigation,
} from './navigation.ts'

test('an installed adapter owns an internal destination it accepts', async () => {
  const seen: string[] = []
  const adapter: HozoNavigationAdapter = {
    navigate(request) {
      seen.push(`adapter:${request.href}`)
      return true
    },
  }

  await activateHozoNavigation(adapter, { href: '/account' }, (href) => {
    seen.push(`fallback:${href}`)
  })

  assert.deepEqual(seen, ['adapter:/account'])
})

test('a declined destination reaches the platform fallback', async () => {
  const seen: string[] = []
  const adapter: HozoNavigationAdapter = {
    navigate(request) {
      seen.push(`adapter:${request.href}`)
      return false
    },
  }

  await activateHozoNavigation(adapter, { href: '/outside' }, (href) => {
    seen.push(`fallback:${href}`)
  })

  assert.deepEqual(seen, ['adapter:/outside', 'fallback:/outside'])
})

test('external destinations bypass an installed adapter', async () => {
  let routed = false
  let opened = ''

  await activateHozoNavigation(
    { navigate: () => (routed = true) },
    { href: 'https://example.com', external: true },
    (href) => {
      opened = href
    },
  )

  assert.equal(routed, false)
  assert.equal(opened, 'https://example.com')
})

test('no provider preserves the standalone platform behavior', async () => {
  let opened = ''
  await activateHozoNavigation(null, { href: 'myapp://settings' }, (href) => {
    opened = href
  })
  assert.equal(opened, 'myapp://settings')
})

test('prefetch is optional, router-owned, and never offered for an external destination', () => {
  const seen: string[] = []
  const adapter: HozoNavigationAdapter = {
    navigate: () => true,
    prefetch(request) {
      seen.push(request.href)
    },
  }

  prefetchHozoNavigation(adapter, { href: '/likely' })
  prefetchHozoNavigation(adapter, { href: 'https://example.com', external: true })
  prefetchHozoNavigation(null, { href: '/standalone' })
  assert.deepEqual(seen, ['/likely'])
})
