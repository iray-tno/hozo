import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { Icon, type IconNode } from './index.tsx'

// Lucide's `search`, in the shape `lucide` exports it.
const SEARCH: IconNode = [
  ['path', { d: 'm21 21-4.34-4.34', key: '14j7rj' }],
  ['circle', { cx: '11', cy: '11', r: '8', key: '4ej97u' }],
]

test('an icon is an inline svg stroked in currentColor, hidden when it has no name', () => {
  const html = renderToStaticMarkup(<Icon icon={SEARCH} />)
  assert.match(
    html,
    /^<svg [^>]*width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"/,
    html,
  )
  assert.match(html, /aria-hidden="true"/, html)
  assert.match(html, /focusable="false"/, html)
  assert.doesNotMatch(html, /role="img"|<title>/, html)
  assert.match(
    html,
    /<path d="m21 21-4.34-4.34"><\/path><circle cx="11" cy="11" r="8"><\/circle>/,
    html,
  )
  assert.doesNotMatch(html, /key=/, 'the key is React’s, not an attribute')
})

test('a named icon is an image with its name, as a label and a title', () => {
  const html = renderToStaticMarkup(
    <Icon icon={SEARCH} accessibilityLabel="Search" size={16} color="red" />,
  )
  assert.match(html, /role="img" aria-label="Search"/, html)
  assert.doesNotMatch(html, /aria-hidden/, html)
  assert.match(html, /<title>Search<\/title>/, html)
  assert.match(html, /width="16" height="16"/, html)
  assert.match(html, /stroke="red"/, html)
})

test('attribute names become React’s, and unknown elements are skipped', () => {
  const html = renderToStaticMarkup(
    <Icon
      icon={[
        ['line', { x1: 1, y1: 2, x2: 3, y2: 4, 'stroke-dasharray': '2' }],
        ['script', { src: 'x' }],
      ]}
    />,
  )
  assert.match(html, /<line x1="1" y1="2" x2="3" y2="4" stroke-dasharray="2"><\/line>/, html)
  assert.doesNotMatch(html, /script/, html)
})

test('on React Native an icon is hidden unless named, and named as one image', async () => {
  const { nativeIconAccessibility, iconShapes } = await import('./icon-node.ts')
  assert.deepEqual(nativeIconAccessibility(undefined), {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  })
  assert.deepEqual(nativeIconAccessibility(''), nativeIconAccessibility(undefined))
  assert.deepEqual(nativeIconAccessibility('Search'), {
    accessible: true,
    accessibilityRole: 'image',
    accessibilityLabel: 'Search',
  })
  assert.deepEqual(iconShapes(SEARCH), [
    { tag: 'path', key: '14j7rj', props: { d: 'm21 21-4.34-4.34' } },
    { tag: 'circle', key: '4ej97u', props: { cx: '11', cy: '11', r: '8' } },
  ])
})
