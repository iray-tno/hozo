/**
 * Two looks that held on React Native and not on the Web, found by the
 * component pages in /docs: an Avatar's initials sat in its top-left corner,
 * and a Skeleton given `rounded-full` stayed a rounded square.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { Avatar, Skeleton } from './index.ts'

const classOf = (html: string, marker: string): string[] => {
  const tag = new RegExp(`<[a-z]+[^>]*${marker}[^>]*>`).exec(html)?.[0] ?? ''
  return (/class="([^"]*)"/.exec(tag)?.[1] ?? '').split(/\s+/)
}

test('an Avatar is a flex box, so its centring classes centre the initials', () => {
  for (const size of ['sm', 'md', 'lg'] as const) {
    const html = renderToStaticMarkup(createElement(Avatar, { name: 'Ada Lovelace', size }))
    const classes = classOf(html, 'data-hozo-avatar')
    assert.ok(classes.includes('flex'), `${size}: ${classes.join(' ')}`)
    assert.ok(classes.includes('items-center') && classes.includes('justify-center'))
  }
})

test('a Skeleton always declares its resting corners for the compiler to separate from callers', () => {
  const corners = (className?: string) =>
    classOf(
      renderToStaticMarkup(createElement(Skeleton, { className })),
      'data-hozo-skeleton',
    ).filter((name) => /(^|:)rounded(-|$)/.test(name))

  assert.deepEqual(corners(), ['rounded-hozo-control'])
  assert.deepEqual(corners('h-4 w-48'), ['rounded-hozo-control'])
  // This is authored markup, not a computed-style oracle. The compiler
  // places the default below the caller; the browser composition fixture
  // checks full and responsive radii in both stylesheet orders.
  assert.deepEqual(corners('size-10 rounded-full'), ['rounded-hozo-control', 'rounded-full'])
  assert.deepEqual(corners('h-4 md:rounded-none'), ['rounded-hozo-control', 'md:rounded-none'])
})
