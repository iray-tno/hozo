import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  bucketFor,
  createStore,
  isAtLeast,
  isPortrait,
  sameViewport,
  ENVIRONMENT_FACTS,
} from './ambient.ts'

test('a store notifies only when the value actually changes', () => {
  // The whole reason the snapshot is coarse: React bails out of a re-render
  // when the snapshot is unchanged, and the store must not defeat that by
  // notifying anyway. On Android a dimension event fires on every
  // keyboard show/hide.
  const store = createStore('md')
  let calls = 0
  store.subscribe(() => {
    calls += 1
  })

  store.set('md')
  assert.equal(calls, 0, 'same value must not notify')
  store.set('lg')
  assert.equal(calls, 1)
})

test('unsubscribing stops notifications', () => {
  const store = createStore(false)
  let calls = 0
  const unsubscribe = store.subscribe(() => {
    calls += 1
  })
  unsubscribe()
  store.set(true)
  assert.equal(calls, 0)
})

test('a width maps to the widest breakpoint it satisfies', () => {
  assert.equal(bucketFor(320), '')
  assert.equal(bucketFor(639), '')
  assert.equal(bucketFor(640), 'sm')
  assert.equal(bucketFor(767), 'sm')
  assert.equal(bucketFor(768), 'md')
  assert.equal(bucketFor(1024), 'lg')
  assert.equal(bucketFor(1280), 'xl')
  assert.equal(bucketFor(1536), '2xl')
  assert.equal(bucketFor(4000), '2xl')
})

test('widths inside one bucket produce an identical snapshot', () => {
  // What the coarse snapshot buys: a resize that stays in one bucket
  // re-renders nothing. (A phone rotating 390 -> 844 genuinely does cross
  // `md`, and should re-render -- that's the feature, not a leak.)
  assert.equal(bucketFor(800), bucketFor(1000))
  assert.equal(bucketFor(300), bucketFor(500))
})

test('height is not an input, so a keyboard opening changes nothing', () => {
  // Android fires a dimension event on every keyboard show/hide. Only
  // width reaches the snapshot, so those events stop here.
  assert.equal(bucketFor(768), 'md')
})

test('a breakpoint is satisfied by itself and by anything wider', () => {
  // Tailwind's variants are min-width, so `md:` applies at md and above.
  assert.equal(isAtLeast('md', 'md'), true)
  assert.equal(isAtLeast('lg', 'md'), true)
  assert.equal(isAtLeast('2xl', 'sm'), true)
  assert.equal(isAtLeast('sm', 'md'), false)
  assert.equal(isAtLeast('', 'sm'), false)
})

test('a viewport store notifies on a real resize and not on a repeat', () => {
  // `Dimensions` reports a fresh object every event, so identity comparison
  // would call every event a change -- and on Android they fire on keyboard
  // show/hide. `useSyncExternalStore` compares snapshots by identity too,
  // so an unchanged size has to keep the *same object*, not merely an equal
  // one.
  const store = createStore({ width: 390, height: 844 }, sameViewport)
  let notifications = 0
  store.subscribe(() => {
    notifications += 1
  })

  const first = store.get()
  store.set({ width: 390, height: 844 })
  assert.equal(notifications, 0)
  assert.equal(store.get(), first, 'snapshot identity must survive a no-op set')

  store.set({ width: 844, height: 390 })
  assert.equal(notifications, 1)
  assert.deepEqual(store.get(), { width: 844, height: 390 })
})

test('viewport equality ignores nothing that matters and nothing that does not', () => {
  assert.equal(sameViewport({ width: 1, height: 2 }, { width: 1, height: 2 }), true)
  assert.equal(sameViewport({ width: 1, height: 2 }, { width: 1, height: 3 }), false)
  assert.equal(sameViewport({ width: 1, height: 2 }, { width: 2, height: 2 }), false)
})

test('an environment query rides on the fact behind it', () => {
  // Twelve queries, nine facts. The pairs are one boolean read two ways,
  // so `motion-safe:` costs nothing that `motion-reduce:` has not already
  // paid for.
  //
  // `contrast-more` is the ninth fact and the only one that is not a
  // single subscription: React Native has two settings behind it, one per
  // platform, and `useHozoEnvironment` reads both.
  //
  // The four added later have no negated spelling, and that is Tailwind's
  // shape rather than an omission: `inverted-colors` has no
  // `not-inverted-colors` either, because `not-` composes with any
  // condition and writing a second name for it would be two ways to say
  // the same thing.
  const facts = new Set(Object.values(ENVIRONMENT_FACTS).map(({ fact }) => fact))
  assert.equal(Object.keys(ENVIRONMENT_FACTS).length, 12)
  assert.equal(facts.size, 9)

  for (const [a, b] of [
    ['motion-reduce', 'motion-safe'],
    ['portrait', 'landscape'],
    ['rtl', 'ltr'],
  ] as const) {
    assert.equal(ENVIRONMENT_FACTS[a].fact, ENVIRONMENT_FACTS[b].fact, `${a}/${b}`)
    assert.notEqual(ENVIRONMENT_FACTS[a].negate, ENVIRONMENT_FACTS[b].negate, `${a}/${b}`)
  }
})

test('orientation breaks the tie the way the media query does', () => {
  // `(orientation: portrait)` is `height >= width`, so a square is
  // portrait. Worth pinning: the obvious `>` would disagree with CSS on
  // exactly one shape, which is the kind of thing nobody tests by hand.
  assert.equal(isPortrait({ width: 100, height: 200 }), true)
  assert.equal(isPortrait({ width: 200, height: 100 }), false)
  assert.equal(isPortrait({ width: 100, height: 100 }), true)
})
