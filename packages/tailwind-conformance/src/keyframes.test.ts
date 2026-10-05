// A project's own `@keyframes` on React Native (decision 007, slice 3).
//
// The compiler hands `useHozoKeyframes` the frames as React Native styles
// and the timing as CSS wrote it. What matters is what the hook does with
// them -- which property tracks it builds, how often it repeats, and what
// the element shows outside the run -- so this renders the hook against the
// stub and reads what it hands back.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

// Imported for its resolve hook: `react-native` has to be the stub first.
import './native-render.ts'

const require = createRequire(import.meta.url)

interface Interpolation {
  __animatedInterpolation: { inputRange: number[]; outputRange: unknown[] }
}
interface Timing {
  config: { toValue: number; duration: number; useNativeDriver: boolean }
  finish: (finished?: boolean) => void
}

const stub = require('./react-native-stub.js') as {
  Animated: {
    __hozoTimings: Timing[]
    __hozoLoops: ({ iterations?: number } | undefined)[]
    __hozoResetTimings: () => void
  }
}
const react = require('react') as {
  createElement: (type: unknown, props?: unknown) => unknown
}
const renderer = require('react-test-renderer') as {
  create: (element: unknown) => { unmount: () => void }
  act: (callback: () => void | Promise<void>) => void | Promise<void>
}
const { useHozoKeyframes } = require('@hozo/engine/generated/animation') as {
  useHozoKeyframes: (spec: unknown) => Record<string, unknown> | null
}

/** Renders the hook and returns a function reading its latest result. */
function run(spec: unknown) {
  stub.Animated.__hozoResetTimings()
  let latest: Record<string, unknown> | null = null
  function Probe() {
    latest = useHozoKeyframes(spec)
    return null
  }
  let root: { unmount: () => void } | undefined
  renderer.act(() => {
    root = renderer.create(react.createElement(Probe))
  })
  return {
    style: () => latest,
    unmount: () => renderer.act(() => root?.unmount()),
  }
}

function track(value: unknown) {
  return (value as Interpolation).__animatedInterpolation
}

test('each property gets a track through the frames that set it', () => {
  const probe = run({
    frames: [
      { at: 0, style: { opacity: 0, transform: [{ rotate: '-3deg' }] } },
      { at: 0.5, style: { transform: [{ rotate: '3deg' }] } },
      { at: 1, style: { opacity: 1, transform: [{ rotate: '-3deg' }] } },
    ],
    duration: 1000,
  })
  const style = probe.style()
  assert.ok(style)
  assert.deepEqual(track(style.opacity), { inputRange: [0, 1], outputRange: [0, 1] })
  const [rotate] = style.transform as { rotate: unknown }[]
  assert.deepEqual(track(rotate?.rotate), {
    inputRange: [0, 0.5, 1],
    outputRange: ['-3deg', '3deg', '-3deg'],
  })
  probe.unmount()
})

test('an end no frame sets is the identity', () => {
  // CSS fills it from the element's own value, which is the identity unless
  // the element has an opacity or a transform of its own.
  const probe = run({
    frames: [{ at: 0.5, style: { opacity: 0.5, transform: [{ scale: 2 }] } }],
    duration: 1000,
  })
  const style = probe.style()
  assert.ok(style)
  assert.deepEqual(track(style.opacity).outputRange, [1, 0.5, 1])
  const [scale] = style.transform as { scale: unknown }[]
  assert.deepEqual(track(scale?.scale).outputRange, [1, 2, 1])
  probe.unmount()
})

test('infinite repeats for good, on the native driver unless a colour moves', () => {
  const opacity = run({ frames: [{ at: 1, style: { opacity: 0 } }], duration: 500, iterations: -1 })
  assert.equal(stub.Animated.__hozoLoops.at(-1)?.iterations, -1)
  assert.equal(stub.Animated.__hozoTimings.at(-1)?.config.useNativeDriver, true)
  assert.equal(stub.Animated.__hozoTimings.at(-1)?.config.duration, 500)
  opacity.unmount()

  const colour = run({ frames: [{ at: 1, style: { backgroundColor: '#ff0000' } }], duration: 500 })
  assert.equal(stub.Animated.__hozoTimings.at(-1)?.config.useNativeDriver, false)
  colour.unmount()
})

test('after the run the element shows its own style, unless the fill mode holds the last frame', () => {
  const plain = run({ frames: [{ at: 1, style: { opacity: 0 } }], duration: 200 })
  assert.notEqual(plain.style(), null)
  renderer.act(() => stub.Animated.__hozoTimings.at(-1)?.finish())
  assert.equal(plain.style(), null, 'fill-mode none kept the last frame')
  plain.unmount()

  const held = run({
    frames: [{ at: 1, style: { opacity: 0 } }],
    duration: 200,
    fillMode: 'forwards',
  })
  renderer.act(() => stub.Animated.__hozoTimings.at(-1)?.finish())
  assert.notEqual(held.style(), null, 'fill-mode forwards dropped the last frame')
  held.unmount()
})

test('through a delay the element shows its own style, unless the fill mode holds the first frame', async () => {
  const plain = run({ frames: [{ at: 0, style: { opacity: 0 } }], duration: 200, delay: 50 })
  assert.equal(plain.style(), null, 'fill-mode none showed the first frame during the delay')
  await renderer.act(() => new Promise((resolve) => setTimeout(resolve, 80)))
  assert.notEqual(plain.style(), null, 'the animation did not start after its delay')
  plain.unmount()

  const held = run({
    frames: [{ at: 0, style: { opacity: 0 } }],
    duration: 200,
    delay: 50,
    fillMode: 'backwards',
  })
  assert.notEqual(held.style(), null, 'fill-mode backwards dropped the first frame')
  held.unmount()
})
