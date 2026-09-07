import assert from 'node:assert/strict'
import test from 'node:test'

import {
  expoRouterNavigation,
  nextRouterNavigation,
  tanStackRouterNavigation,
} from './router-adapters.ts'

test('Next.js receives the authored href through push', () => {
  const calls: string[] = []
  const navigate = nextRouterNavigation({
    push: (href) => calls.push(`push:${href}`),
    replace: (href) => calls.push(`replace:${href}`),
  })
  assert.equal(navigate('/orders/1', { href: '/orders/1' }), true)
  assert.equal(navigate('/signed-in', { href: '/signed-in', replace: true }), true)
  assert.deepEqual(calls, ['push:/orders/1', 'replace:/signed-in'])
})

test('Expo Router receives the authored href through ordinary navigate semantics', () => {
  const calls: string[] = []
  const navigate = expoRouterNavigation({
    navigate: (href: string) => calls.push(`navigate:${href}`),
    replace: (href: string) => calls.push(`replace:${href}`),
  })
  assert.equal(navigate('/orders/2', { href: '/orders/2' }), true)
  assert.equal(navigate('/signed-in', { href: '/signed-in', replace: true }), true)
  assert.deepEqual(calls, ['navigate:/orders/2', 'replace:/signed-in'])
})

test('TanStack Router receives a to option rather than an untyped positional URL', () => {
  const calls: unknown[] = []
  const navigate = tanStackRouterNavigation({ navigate: (options: unknown) => calls.push(options) })
  assert.equal(navigate('/orders/3', { href: '/orders/3' }), true)
  assert.equal(navigate('/signed-in', { href: '/signed-in', replace: true }), true)
  assert.deepEqual(calls, [{ to: '/orders/3' }, { to: '/signed-in', replace: true }])
})

test('an asynchronous router remains pending until its transition completes', async () => {
  let complete = false
  const navigate = tanStackRouterNavigation({
    async navigate() {
      await Promise.resolve()
      complete = true
    },
  })

  const result = navigate('/orders/4', { href: '/orders/4' })
  assert.equal(complete, false)
  assert.equal(await result, true)
  assert.equal(complete, true)
})
