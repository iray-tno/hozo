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

// #1126: what needs the element. A spread translated during render gets a
// callback ref; these drive it with a stand-in element, since there is no DOM.
const fakeElement = (box = { x: 0, y: 0, width: 10, height: 20 }) => {
  const element = {
    offsetLeft: box.x,
    offsetTop: box.y,
    getBoundingClientRect: () => ({ width: box.width, height: box.height, left: 0, top: 0 }),
    setPointerCapture() {},
    releasePointerCapture() {},
    hasPointerCapture: () => false,
  }
  return { element: element as unknown as HTMLElement, box }
}
type Ref = (node: HTMLElement | null) => (() => void) | undefined

test('a spread with onLayout reports the layout once, keeps it across a re-render, and stops when the element goes', async () => {
  const observers: { callback: () => void; disconnected: boolean }[] = []
  const previous = globalThis.ResizeObserver
  globalThis.ResizeObserver = class {
    entry: { callback: () => void; disconnected: boolean }
    constructor(callback: () => void) {
      this.entry = { callback, disconnected: false }
      observers.push(this.entry)
    }
    observe() {}
    disconnect() {
      this.entry.disconnected = true
    }
  } as unknown as typeof ResizeObserver
  try {
    const layouts: unknown[] = []
    const onLayout = (event: { nativeEvent: { layout: unknown } }) =>
      layouts.push(event.nativeEvent.layout)
    const { element, box } = fakeElement()
    const first = hozoViewDomProps({ onLayout, testID: 'row' }) as Record<string, unknown>
    assert.equal(first.onLayout, undefined, 'onLayout reached the DOM')
    assert.equal(first['data-testid'], 'row')
    const cleanup = (first.ref as Ref)(element)
    assert.deepEqual(layouts, [{ x: 0, y: 0, width: 10, height: 20 }])

    // A re-render: the old ref's cleanup, then the new ref on the same element.
    cleanup?.()
    const second = hozoViewDomProps({ onLayout, testID: 'row' }) as Record<string, unknown>
    const cleanupSecond = (second.ref as Ref)(element)
    await Promise.resolve()
    assert.equal(observers.length, 1, 'a re-render made a second observer')
    assert.equal(observers[0]?.disconnected, false)
    assert.equal(layouts.length, 1, 'a re-render reported the same layout again')

    box.width = 30
    observers[0]?.callback()
    assert.deepEqual(layouts.at(-1), { x: 0, y: 0, width: 30, height: 20 })

    cleanupSecond?.()
    await Promise.resolve()
    assert.equal(observers[0]?.disconnected, true, 'the observer outlived the element')
  } finally {
    globalThis.ResizeObserver = previous
  }
})

test('a spread with no element-bound props gets no ref, and a caller ref is still handed the element', () => {
  assert.equal((hozoViewDomProps({ testID: 'x' }) as Record<string, unknown>).ref, undefined)
  const seen: unknown[] = []
  const { element } = fakeElement()
  const dom = hozoViewDomProps({
    onLayout() {},
    ref: (node: unknown) => seen.push(node),
  }) as Record<string, unknown>
  const cleanup = (dom.ref as Ref)(element)
  cleanup?.()
  assert.deepEqual(seen, [element, null])
})

test('a spread with responder props claims the pointer through the element it lands on', () => {
  const calls: string[] = []
  const { element } = fakeElement()
  const dom = hozoViewDomProps({
    onStartShouldSetResponder: () => true,
    onResponderGrant: () => calls.push('grant'),
    onResponderRelease: () => calls.push('release'),
  }) as Record<string, unknown>
  for (const name of ['onStartShouldSetResponder', 'onResponderGrant', 'onResponderRelease']) {
    assert.equal(dom[name], undefined, `${name} reached the DOM`)
  }
  const cleanup = (dom.ref as Ref)(element)
  const event = (type: string) => ({
    type,
    pointerId: 1,
    isPrimary: true,
    clientX: 1,
    clientY: 1,
    pageX: 1,
    pageY: 1,
    timeStamp: type === 'pointerdown' ? 1 : 2,
    currentTarget: element,
    target: element,
    stopPropagation() {},
    nativeEvent: {},
  })
  ;(dom.onPointerDown as (event: unknown) => void)(event('pointerdown'))
  ;(dom.onPointerUp as (event: unknown) => void)(event('pointerup'))
  assert.deepEqual(calls, ['grant', 'release'])
  cleanup?.()
})

test('an Image spread falls back to defaultSource when its src fails to load', () => {
  const errors: unknown[] = []
  const dom = hozoImageDomProps({
    src: 'https://example.com/a.png',
    defaultSource: { uri: '/fallback.png' },
    onError: (event: unknown) => errors.push(event),
  }) as Record<string, unknown>
  assert.equal(dom.src, 'https://example.com/a.png')
  let src = 'https://example.com/a.png'
  const img = {
    getAttribute: () => src,
    set src(value: string) {
      src = value
    },
  }
  ;(dom.onError as (event: unknown) => void)({ currentTarget: img })
  assert.equal(src, '/fallback.png')
  assert.equal(errors.length, 1, "the caller's onError was not called")
  assert.equal(
    (hozoImageDomProps({ src: 'a.png' }) as Record<string, unknown>).onError,
    undefined,
    'an Image with no defaultSource gained an onError',
  )
})
