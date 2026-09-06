// A style change has to start the transition.
//
// `HozoAnimated` animates from the last style it saw to the current one.
// It knows the style moved from `signature` -- a `JSON.stringify` of the
// flattened style, compared during render -- and the effect that starts
// the animation lists it as a dependency without reading it. That is
// exactly the shape `useExhaustiveDependencies` calls unnecessary, and
// `biome check --unsafe` removed it once. Nothing failed: the compiler
// emits `hozoTransition={{ ... }}` as a fresh object literal every
// render, so the effect re-ran anyway and the compiled path was fine.
//
// The component is public, though, and a caller who passes a stable
// transition object gets the other behaviour: the style moves and nothing
// animates. That is the case here, and it is the reason this is a
// component test rather than a compiled-fixture one -- a fixture cannot
// reach it, which is why nothing did.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

// Imported for its resolve hook: `react-native` has to be the stub before
// anything below pulls `@hozo/runtime` in.
import './native-render.ts'

const require = createRequire(import.meta.url)

interface Timing {
  config: { duration: number }
}

const stub = require('./react-native-stub.js') as {
  Animated: { __hozoTimings: Timing[]; __hozoResetTimings: () => void }
}
const react = require('react') as {
  createElement: (type: unknown, props?: unknown) => unknown
}
const renderer = require('react-test-renderer') as {
  create: (element: unknown) => { update: (element: unknown) => void; unmount: () => void }
  act: (callback: () => void) => void
}
const { HozoAnimated } = require('@hozo/runtime') as {
  HozoAnimated: unknown
}

/** One object, reused, which is the point: only the style moves. */
const TRANSITION = { duration: 200, delay: 0, easing: 'linear' }

test('a style change restarts the animation, with the transition unchanged', () => {
  stub.Animated.__hozoResetTimings()
  let root: { update: (element: unknown) => void; unmount: () => void } | undefined
  renderer.act(() => {
    root = renderer.create(
      react.createElement(HozoAnimated, {
        style: { opacity: 0 },
        hozoTransition: TRANSITION,
      }),
    )
  })
  assert.ok(root)
  const mounted = root
  assert.equal(stub.Animated.__hozoTimings.length, 1, 'nothing animated on mount')

  renderer.act(() => {
    mounted.update(
      react.createElement(HozoAnimated, {
        style: { opacity: 1 },
        hozoTransition: TRANSITION,
      }),
    )
  })
  assert.equal(
    stub.Animated.__hozoTimings.length,
    2,
    'the style moved and nothing animated: the effect did not see the change',
  )

  renderer.act(() => {
    mounted.unmount()
  })
})

test('a re-render that changes nothing does not restart it', () => {
  // The other half of the same dependency. Restarting on every render
  // would make a transition that never finishes.
  stub.Animated.__hozoResetTimings()
  let root: { update: (element: unknown) => void; unmount: () => void } | undefined
  const props = { style: { opacity: 0 }, hozoTransition: TRANSITION }
  renderer.act(() => {
    root = renderer.create(react.createElement(HozoAnimated, props))
  })
  assert.ok(root)
  const mounted = root

  renderer.act(() => {
    mounted.update(react.createElement(HozoAnimated, { ...props }))
  })
  assert.equal(stub.Animated.__hozoTimings.length, 1, 'an unchanged style animated again')

  renderer.act(() => {
    mounted.unmount()
  })
})
