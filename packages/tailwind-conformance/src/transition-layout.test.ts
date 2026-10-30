// Position and size animate only when the transition names them.
//
// `HozoAnimated` animated opacity, colours and transforms whenever they
// changed. Position and size are new, and they must not start moving where
// they did not before: a `transition-colors` beside an `md:w-80` resized at
// once and still has to. So they read the spec's `properties`, and a spec
// without it animates none.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

// Imported for its resolve hook: `react-native` has to be the stub before
// anything below pulls `@hozo/engine` in.
import './native-render.ts'

const require = createRequire(import.meta.url)

interface Interpolation {
  __animatedInterpolation: { outputRange: unknown[] }
}

const react = require('react') as {
  createElement: (type: unknown, props?: unknown) => unknown
}
const renderer = require('react-test-renderer') as {
  create: (element: unknown) => {
    update: (element: unknown) => void
    unmount: () => void
    toJSON: () => { props: { style: unknown } }
  }
  act: (callback: () => void) => void
}
const { HozoAnimated } = require('@hozo/engine/generated/animated') as {
  HozoAnimated: unknown
}

/** The overrides `HozoAnimated` lays over the settled style. */
function overrides(
  from: Record<string, unknown>,
  to: Record<string, unknown>,
  transition: Record<string, unknown>,
) {
  let root: ReturnType<typeof renderer.create> | undefined
  renderer.act(() => {
    root = renderer.create(
      react.createElement(HozoAnimated, { style: from, hozoTransition: transition }),
    )
  })
  assert.ok(root)
  const mounted = root
  renderer.act(() => {
    mounted.update(react.createElement(HozoAnimated, { style: to, hozoTransition: transition }))
  })
  const style = mounted.toJSON().props.style
  renderer.act(() => mounted.unmount())
  return (Array.isArray(style) ? style[1] : {}) as Record<string, Interpolation | undefined>
}

const range = (value: Interpolation | undefined) => value?.__animatedInterpolation.outputRange

test('an inline-start inset named by the transition slides from where it was', () => {
  const moved = overrides(
    { start: 4, backgroundColor: '#ffffff' },
    { start: 16, backgroundColor: '#000000' },
    { duration: 150, easing: 'ease-out', properties: ['inset-inline-start', 'background-color'] },
  )
  assert.deepEqual(range(moved.start), [4, 16])
  assert.deepEqual(range(moved.backgroundColor), ['#ffffff', '#000000'])
})

test('a size or position the transition does not name changes at once', () => {
  const moved = overrides(
    { width: 100, start: 4, opacity: 0 },
    { width: 320, start: 16, opacity: 1 },
    { duration: 150, easing: 'ease-out', properties: ['opacity'] },
  )
  assert.equal(moved.width, undefined, 'the width animated without being named')
  assert.equal(moved.start, undefined)
  assert.deepEqual(range(moved.opacity), [0, 1], 'opacity animates as it always has')
})

test('a spec without properties animates no position or size, as before', () => {
  const moved = overrides(
    { height: 0, backgroundColor: '#ffffff' },
    { height: 120, backgroundColor: '#000000' },
    { duration: 150, easing: 'linear' },
  )
  assert.equal(moved.height, undefined)
  assert.deepEqual(range(moved.backgroundColor), ['#ffffff', '#000000'])
})

test('transition-all covers position and size; a value that is not a number does not', () => {
  const moved = overrides(
    { height: 0, width: '50%' },
    { height: 120, width: '100%' },
    { duration: 150, easing: 'linear', properties: ['all'] },
  )
  assert.deepEqual(range(moved.height), [0, 120])
  assert.equal(moved.width, undefined, 'a percentage has nothing to interpolate before layout')
})
