import assert from 'node:assert/strict'
import test from 'node:test'

import { createDeepLinkDispatcher, parseDeepLink } from './deep-link-event.ts'

test('universal links retain their path, repeated query values, fragment, and source', () => {
  const event = parseDeepLink(
    'https://app.example.com/products/42?tag=new&tag=sale&q=blue+shoe#details',
    'initial',
  )
  assert.equal(
    event.url,
    'https://app.example.com/products/42?tag=new&tag=sale&q=blue+shoe#details',
  )
  assert.equal(event.path, '/products/42')
  assert.deepEqual({ ...event.queryParams }, { tag: ['new', 'sale'], q: 'blue shoe' })
  assert.equal(event.fragment, 'details')
  assert.equal(event.source, 'initial')
})

test('a custom-scheme authority becomes the first application path segment', () => {
  const event = parseDeepLink('myapp://products/42?ref=mail')
  assert.equal(event.path, '/products/42')
  assert.deepEqual({ ...event.queryParams }, { ref: 'mail' })
})

test('relative references and malformed input still produce useful events', () => {
  assert.equal(parseDeepLink('/account?tab=billing').path, '/account')
  assert.equal(parseDeepLink('http://[').path, 'http://[')
})

test('duplicate platform notifications collapse but a later revisit remains observable', () => {
  const seen: string[] = []
  const dispatch = createDeepLinkDispatcher((event) => seen.push(`${event.source}:${event.url}`))
  dispatch('myapp://one', 'initial')
  dispatch('myapp://one', 'event')
  dispatch('myapp://two', 'event')
  dispatch('myapp://one', 'event')
  assert.deepEqual(seen, ['initial:myapp://one', 'event:myapp://two', 'event:myapp://one'])
})
