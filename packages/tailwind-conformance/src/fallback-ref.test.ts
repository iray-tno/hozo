// A `ref` on an uncompiled `View`, `Text` or `Image` reaches the element.
//
// React Native's `View` takes one, and the compiled `<div>` passes it straight
// through. The Web fallbacks kept a ref of their own for `onLayout` and gave
// the caller nothing, so a landing-page component that needed its stage element
// had to write a `<div>` instead of a `View`: whether `ref` worked depended on
// whether the compiler had run.
//
// `react-test-renderer` rather than `renderToStaticMarkup`, which never
// attaches a ref. `createNodeMock` stands in for the DOM node.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const react = require('react') as {
  createElement: (
    type: unknown,
    props?: Record<string, unknown> | null,
    ...children: unknown[]
  ) => unknown
  createRef: <T>() => { current: T | null }
}
const renderer = require('react-test-renderer') as {
  create: (
    element: unknown,
    options?: { createNodeMock?: (element: { type: string }) => unknown },
  ) => { unmount: () => void }
  act: (callback: () => void | Promise<void>) => Promise<void>
}
const { View, Text, Image } = (await import('@hozo/primitives')) as Record<string, unknown>

function node(type: string) {
  return {
    type,
    offsetLeft: 0,
    offsetTop: 0,
    getBoundingClientRect: () => ({ width: 120, height: 40 }),
  }
}

for (const [name, component, tag, props] of [
  ['View', View, 'div', {}],
  ['Text', Text, 'span', {}],
  ['Image', Image, 'img', { src: '/a.png', alt: '' }],
] as const) {
  test(`an uncompiled ${name} hands its element to the caller's ref and still measures`, async () => {
    const ref = react.createRef<{ type: string }>()
    const layouts: unknown[] = []
    let tree: { unmount: () => void } | undefined
    await renderer.act(async () => {
      tree = renderer.create(
        react.createElement(component, {
          ...props,
          ref,
          onLayout: (event: { nativeEvent: { layout: unknown } }) =>
            layouts.push(event.nativeEvent.layout),
        }),
        { createNodeMock: (element) => node(element.type) },
      )
    })
    assert.equal(ref.current?.type, tag, `${name} did not reach the caller's ref`)
    // The fallback's own use of the element is the other half: forwarding the
    // ref must not have taken it away from `onLayout`.
    assert.deepEqual(layouts, [{ x: 0, y: 0, width: 120, height: 40 }])
    await renderer.act(async () => tree?.unmount())
    assert.equal(ref.current, null, `${name} left the caller's ref pointing at an unmounted node`)
  })
}

test('a callback ref gets the element too', async () => {
  const seen: unknown[] = []
  await renderer.act(async () => {
    renderer.create(react.createElement(View, { ref: (value: unknown) => seen.push(value) }), {
      createNodeMock: (element) => node(element.type),
    })
  })
  assert.equal((seen[0] as { type: string } | undefined)?.type, 'div')
})
