// The cache that forgets.
//
// Fonts are a fixed set -- a chart uses a handful of specs and reuses
// them -- so an unbounded map was fine there. Paths are not: a line chart
// that animates builds a new `d` string every frame, and each one parsed
// by `Path2D` or `MakeFromSVGString` was kept for the life of the
// process. That is the workload #154 names as Canvas mode's reason to
// exist, so the leak was pointed at exactly the case the package is for.

import assert from 'node:assert/strict'
import test from 'node:test'

import { BoundedCache } from './scene.tsx'

test('a cache under its limit keeps everything', () => {
  const cache = new BoundedCache<number>(3)
  cache.set('a', 1)
  cache.set('b', 2)
  assert.equal(cache.get('a'), 1)
  assert.equal(cache.size, 2)
})

test('past the limit the oldest goes', () => {
  const cache = new BoundedCache<number>(2)
  cache.set('a', 1)
  cache.set('b', 2)
  cache.set('c', 3)
  assert.equal(cache.size, 2)
  assert.equal(cache.get('a'), undefined, 'the oldest survived eviction')
  assert.equal(cache.get('c'), 3)
})

test('reading an entry makes it new again', () => {
  // What makes "oldest insertion" mean "least recently used". Without it
  // a path drawn on every frame would be evicted by paths drawn once,
  // which is the wrong way round.
  const cache = new BoundedCache<number>(2)
  cache.set('a', 1)
  cache.set('b', 2)
  cache.get('a')
  cache.set('c', 3)
  assert.equal(cache.get('a'), 1, 'the entry just read was evicted')
  assert.equal(cache.get('b'), undefined)
})

test('rewriting a key does not grow the cache', () => {
  const cache = new BoundedCache<number>(2)
  cache.set('a', 1)
  cache.set('a', 2)
  assert.equal(cache.size, 1)
  assert.equal(cache.get('a'), 2)
})

test('a frame of new paths does not accumulate', () => {
  // The animation case, stated as the test it is: a thousand distinct
  // path strings, which is what a few seconds of an animated line chart
  // produces, and the cache stays at its bound instead of at a thousand.
  const cache = new BoundedCache<string>(256)
  for (let frame = 0; frame < 1_000; frame += 1) cache.set(`M0 ${frame} L10 ${frame}`, 'parsed')
  assert.equal(cache.size, 256)
})
