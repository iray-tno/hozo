import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Image, Text, View } from './foundation.tsx'
import { hozoImageDomProps, hozoViewDomProps } from './generated/view-dom-props.ts'

// #1122: a compiled View, Text or Image receives its spread in the
// primitive's words.
const props = {
  accessibilityLabel: 'Close',
  accessibilityHint: 'Closes the panel',
  testID: 'close',
  nativeID: 'close-box',
  pointerEvents: 'box-none',
  accessibilityState: { disabled: true, selected: true, expanded: false },
  accessibilityValue: { min: 0, max: 10, now: 3, text: 'three' },
  accessibilityLiveRegion: 'polite',
  style: [{ opacity: 0.5 }, false, { marginTop: 4 }],
} as const

// The attributes of the first `<tag ...>` in the markup, sorted, so the
// uncompiled View's base `<style>` and attribute order do not matter.
const attributes = (html: string, tag: string) => {
  const element = html.match(new RegExp(`<${tag}( [^>]*)?/?>`))?.[1] ?? ''
  return [...element.matchAll(/ ([\w-]+)="([^"]*)"/g)].map(([, n, v]) => `${n}=${v}`).sort()
}

test('the compiled <div> matches the uncompiled View for the same props', () => {
  const compiled = renderToStaticMarkup(
    createElement('div', { className: 'hozo-view', ...hozoViewDomProps(props) }),
  )
  const fallback = renderToStaticMarkup(createElement(View, props as never))
  assert.deepEqual(attributes(compiled, 'div'), attributes(fallback, 'div'))
  assert.match(compiled, /aria-label="Close"/)
})

test('the compiled <span> matches the uncompiled Text', () => {
  const compiled = renderToStaticMarkup(createElement('span', hozoViewDomProps(props)))
  const fallback = renderToStaticMarkup(createElement(Text, props as never))
  assert.deepEqual(attributes(compiled, 'span'), attributes(fallback, 'span'))
})

test('the compiled <img> matches the uncompiled Image, with an object src', () => {
  const image = { ...props, src: [{ uri: 'a.png' }, { uri: 'b.png' }] }
  const compiled = renderToStaticMarkup(createElement('img', hozoImageDomProps(image)))
  const fallback = renderToStaticMarkup(createElement(Image, image as never))
  assert.deepEqual(attributes(compiled, 'img'), attributes(fallback, 'img'))
  assert.match(compiled, /src="a.png"/)
  assert.match(compiled, /alt="Close"/)
})

test('an explicit alt wins over the accessibility label, as it does uncompiled', () => {
  const dom = hozoImageDomProps({ src: 'a.png', alt: 'A cat', accessibilityLabel: 'Close' })
  assert.deepEqual(dom, { src: 'a.png', alt: 'A cat' })
})

test('DOM props pass through, and keys the spread does not hold are not set', () => {
  const onKeyDown = () => {}
  const dom = hozoViewDomProps({ 'aria-hidden': true, onKeyDown, className: 'x' })
  assert.deepEqual(dom, { 'aria-hidden': true, onKeyDown, className: 'x' })
})

test('a spread that is not an object is returned as it is', () => {
  assert.equal(hozoViewDomProps(undefined), undefined)
  assert.equal(hozoImageDomProps(null), null)
})
