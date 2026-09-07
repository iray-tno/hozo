import assert from 'node:assert/strict'
import test from 'node:test'

import type { HozoNavigationAdapter } from '@hozo/runtime/navigation'
import { routeNavigationPrefetch } from './web-prefetch.ts'

function intent(attributes: Record<string, string>, adapter: HozoNavigationAdapter) {
  const anchor = {
    getAttribute(name: string) {
      return attributes[name] ?? null
    },
    hasAttribute(name: string) {
      return name in attributes
    },
  } as unknown as Element
  const event = { target: { closest: () => anchor } as unknown as EventTarget }
  const prefetched = new WeakMap<Element, string>()
  routeNavigationPrefetch(event, adapter, prefetched)
  routeNavigationPrefetch(event, adapter, prefetched)
}

test('hover and focus intent warm the current href only once', () => {
  const seen: string[] = []
  intent(
    { href: '/likely', 'data-hozo-navigation-prefetch': '' },
    { navigate: () => true, prefetch: (request) => seen.push(request.href) },
  )
  assert.deepEqual(seen, ['/likely'])
})

test('disabled and browser-owned destinations are not prefetched', () => {
  const seen: string[] = []
  const adapter: HozoNavigationAdapter = {
    navigate: () => true,
    prefetch: (request) => seen.push(request.href),
  }
  const cases: Record<string, string>[] = [
    { href: '/disabled', 'data-hozo-navigation-prefetch': '', 'data-hozo-disabled': '' },
    { href: '/download', 'data-hozo-navigation-prefetch': '', download: '' },
    { href: '/new-tab', 'data-hozo-navigation-prefetch': '', target: '_blank' },
    { href: '/external-rel', 'data-hozo-navigation-prefetch': '', rel: 'nofollow external' },
  ]
  for (const attributes of cases) {
    intent(attributes, adapter)
  }
  assert.deepEqual(seen, [])
})
