import assert from 'node:assert/strict'
import test from 'node:test'

import type { HozoNavigationAdapter } from '@hozo/runtime/navigation'
import { navigationRequestForClick, routeNavigationClick } from './web-click.ts'

function click(
  attributes: Record<string, string> = { href: '/account' },
  event: Partial<MouseEvent> = {},
) {
  const anchor = {
    getAttribute(name: string) {
      return attributes[name] ?? null
    },
    hasAttribute(name: string) {
      return name in attributes
    },
  }
  return navigationRequestForClick({
    altKey: false,
    button: 0,
    ctrlKey: false,
    defaultPrevented: false,
    metaKey: false,
    shiftKey: false,
    target: { closest: () => anchor } as unknown as EventTarget,
    ...event,
  })
}

test('an ordinary anchor click retains the authored relative href', () => {
  assert.deepEqual(click(), { href: '/account' })
})

test('a replace marker is recovered as router navigation intent', () => {
  assert.deepEqual(click({ href: '/signed-in', 'data-hozo-navigation-replace': '' }), {
    href: '/signed-in',
    replace: true,
  })
})

test('browser-owned link affordances are not intercepted', () => {
  assert.equal(click(undefined, { ctrlKey: true }), null)
  assert.equal(click(undefined, { button: 1 }), null)
  assert.equal(click({ href: '/report', download: '' }), null)
  assert.equal(click({ href: '/account', target: '_blank' }), null)
  assert.equal(click({ href: '/account', rel: 'nofollow external' }), null)
  assert.equal(click(undefined, { defaultPrevented: true }), null)
})

test('a synchronous adapter decline leaves the browser click untouched', () => {
  let prevented = false
  const adapter: HozoNavigationAdapter = { navigate: () => false }
  routeNavigationClick({ ...clickEvent(), preventDefault: () => (prevented = true) }, adapter, () =>
    assert.fail('the native browser fallback should remain in control'),
  )
  assert.equal(prevented, false)
})

test('an accepted route is intercepted and an asynchronous decline receives a fallback', async () => {
  let prevented = false
  let fallback = ''
  const adapter: HozoNavigationAdapter = { navigate: async () => false }
  await routeNavigationClick(
    { ...clickEvent(), preventDefault: () => (prevented = true) },
    adapter,
    (href) => {
      fallback = href
    },
  )
  assert.equal(prevented, true)
  assert.equal(fallback, '/account')
})

function clickEvent(): Parameters<typeof navigationRequestForClick>[0] {
  const anchor = {
    getAttribute(name: string) {
      return name === 'href' ? '/account' : null
    },
    hasAttribute() {
      return false
    },
  }
  return {
    altKey: false,
    button: 0,
    ctrlKey: false,
    defaultPrevented: false,
    metaKey: false,
    shiftKey: false,
    target: { closest: () => anchor } as unknown as EventTarget,
  }
}
