import assert from 'node:assert/strict'
import test from 'node:test'

import type { DeepLinkEvent } from './deep-link-event.ts'
import {
  type NativeLinkingLike,
  subscribeToNativeDeepLinks,
} from './native-deep-link-subscription.ts'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

test('a foreground arrival wins a slower cold-start lookup', async () => {
  const initial = deferred<string | null>()
  const order: string[] = []
  const seen: DeepLinkEvent[] = []
  let listener: ((event: { url: string }) => void) | undefined
  const linking: NativeLinkingLike = {
    addEventListener(_event, next) {
      order.push('subscribe')
      listener = next
      return { remove: () => order.push('remove') }
    },
    getInitialURL() {
      order.push('initial')
      return initial.promise
    },
  }

  const cleanup = subscribeToNativeDeepLinks(linking, (event) => seen.push(event), true)
  assert.deepEqual(order, ['subscribe', 'initial'])
  listener?.({ url: 'myapp://new' })
  initial.resolve('myapp://stale')
  await initial.promise
  await Promise.resolve()
  assert.deepEqual(
    seen.map(({ url, source }) => ({ url, source })),
    [{ url: 'myapp://new', source: 'event' }],
  )

  cleanup()
  listener?.({ url: 'myapp://after-cleanup' })
  assert.equal(seen.length, 1)
  assert.deepEqual(order, ['subscribe', 'initial', 'remove'])
})

test('a cold-start URL is delivered when no newer event arrived', async () => {
  const seen: DeepLinkEvent[] = []
  const linking: NativeLinkingLike = {
    addEventListener: () => ({ remove() {} }),
    getInitialURL: async () => 'myapp://products/42',
  }
  subscribeToNativeDeepLinks(linking, (event) => seen.push(event), true)
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(seen[0]?.source, 'initial')
  assert.equal(seen[0]?.path, '/products/42')
})
