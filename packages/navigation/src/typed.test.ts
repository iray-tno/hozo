import assert from 'node:assert/strict'
import test from 'node:test'

import { Button, Link, Pressable } from '@hozo/core'

import { createTypedNavigationPrimitives, untypedHref } from './typed.ts'

type ObjectDestination = { pathname: string; params?: Record<string, string> }

test('typed primitives resolve object destinations before reaching core', () => {
  const Typed = createTypedNavigationPrimitives<ObjectDestination>({
    resolveHref: ({ pathname, params }) =>
      params ? `${pathname}?${new URLSearchParams(params)}` : pathname,
  })

  const link = Typed.Link({
    href: { pathname: '/posts/[postId]', params: { postId: '42' } },
    children: 'Post',
  })
  const button = Typed.Button({ href: { pathname: '/settings' }, children: 'Settings' })
  const pressable = Typed.Pressable({ href: untypedHref('/computed'), children: 'Computed' })

  assert.ok(link)
  assert.ok(button)
  assert.ok(pressable)
  assert.equal(link.type, Link)
  assert.equal((link.props as { href: string }).href, '/posts/[postId]?postId=42')
  assert.equal(button.type, Button)
  assert.equal((button.props as { href: string }).href, '/settings')
  assert.equal(pressable.type, Pressable)
  assert.equal((pressable.props as { href: string }).href, '/computed')
})

test('external URLs and action controls do not need a router resolver', () => {
  const Typed = createTypedNavigationPrimitives<ObjectDestination>()

  const link = Typed.Link({ href: 'https://example.com', external: true })
  const button = Typed.Button({ onPress() {} })

  assert.ok(link)
  assert.ok(button)
  assert.equal((link.props as { href: string }).href, 'https://example.com')
  assert.equal((button.props as { href?: string }).href, undefined)
})

test('an object destination without a resolver fails explicitly', () => {
  const Typed = createTypedNavigationPrimitives<ObjectDestination>()

  assert.throws(
    () => Typed.Link({ href: { pathname: '/details' } }),
    /typed object destination needs resolveHref/,
  )
})
