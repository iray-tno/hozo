// `starting:` on React Native: an element enters from its starting values
// (decision 007, slice 1).
//
// The compiler hands a `starting:` style to `HozoAnimated` as
// `hozoStarting`. The component starts the element there and transitions
// to `style` on mount -- what `@starting-style` does on Web. A component
// test rather than a compiled fixture, for the same reason as
// `transition-restart.test.ts`: what matters is what the component does
// with the prop, and the stub records it.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

// Imported for its resolve hook: `react-native` has to be the stub before
// anything below pulls `@hozo/engine` in.
import './native-render.ts'

const require = createRequire(import.meta.url)

interface Interpolation {
  __animatedInterpolation: { inputRange: number[]; outputRange: unknown[] }
}

const stub = require('./react-native-stub.js') as {
  Animated: { __hozoTimings: unknown[]; __hozoResetTimings: () => void }
}
const react = require('react') as {
  createElement: (type: unknown, props?: unknown) => unknown
}
const renderer = require('react-test-renderer') as {
  create: (element: unknown) => {
    toJSON: () => { props: { style: unknown } }
    unmount: () => void
  }
  act: (callback: () => void) => void
}
const { HozoAnimated } = require('@hozo/primitives/generated/animated') as {
  HozoAnimated: unknown
}

const TRANSITION = { duration: 200, delay: 0, easing: 'ease-out' }

/** The animated overrides `HozoAnimated` lays over the flat style. */
function overridesOf(style: unknown): Record<string, unknown> {
  assert.ok(Array.isArray(style), `expected [flat, overrides], got ${JSON.stringify(style)}`)
  return (style[1] ?? {}) as Record<string, unknown>
}

function mount(props: Record<string, unknown>) {
  stub.Animated.__hozoResetTimings()
  let root: ReturnType<typeof renderer.create> | undefined
  renderer.act(() => {
    root = renderer.create(react.createElement(HozoAnimated, props))
  })
  assert.ok(root)
  return root
}

test('an element with a starting style enters from it', () => {
  const root = mount({
    style: { opacity: 1, transform: [{ translateY: 0 }] },
    hozoStarting: { opacity: 0, transform: [{ translateY: 16 }] },
    hozoTransition: TRANSITION,
  })
  const overrides = overridesOf(root.toJSON().props.style)

  const opacity = overrides.opacity as Interpolation | undefined
  assert.deepEqual(opacity?.__animatedInterpolation.outputRange, [0, 1], 'opacity does not fade in')

  const transform = overrides.transform as { translateY: Interpolation }[] | undefined
  assert.deepEqual(
    transform?.[0]?.translateY.__animatedInterpolation.outputRange,
    [16, 0],
    'translateY does not slide from its starting value',
  )

  assert.equal(stub.Animated.__hozoTimings.length, 1, 'the enter animation did not start on mount')
  renderer.act(() => root.unmount())
})

test('without a starting style, mounting moves nothing', () => {
  // The behaviour before decision 007, and still the behaviour for an
  // element with a transition and no `starting:` class.
  const root = mount({ style: { opacity: 1 }, hozoTransition: TRANSITION })
  const overrides = overridesOf(root.toJSON().props.style)
  assert.equal(overrides.opacity, undefined, 'an element with no starting style animated in')
  renderer.act(() => root.unmount())
})

test('the starting style is read once, not kept', () => {
  // A re-render with the same `hozoStarting` must not send the element back
  // to its first frame: it is where the element entered from.
  const props = {
    style: { opacity: 1 },
    hozoStarting: { opacity: 0 },
    hozoTransition: TRANSITION,
  }
  const root = mount(props)
  renderer.act(() => {
    ;(root as unknown as { update: (element: unknown) => void }).update(
      react.createElement(HozoAnimated, { ...props, style: { opacity: 1 } }),
    )
  })
  assert.equal(
    stub.Animated.__hozoTimings.length,
    1,
    'an unchanged style restarted the enter animation',
  )
  renderer.act(() => root.unmount())
})
