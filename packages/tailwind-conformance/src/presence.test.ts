// `Presence` keeps a child mounted while it animates out (decision 007,
// slice 2), on both platforms.
//
// Native: the compiler hands a `data-[state=closed]:` style to
// `HozoAnimated` as `hozoExit`, and `HozoAnimated` reads the closing state
// from `Presence`. Web: `Presence` sets `data-state` on its child and waits
// for the transition the class starts. Component tests, like
// `starting-style.test.ts`: what matters is when the child goes away.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'

// Imported for its resolve hook: `react-native` has to be the stub before
// anything below pulls `@hozo/engine` in.
import './native-render.ts'

const require = createRequire(import.meta.url)

interface Interpolation {
  __animatedInterpolation: { inputRange: number[]; outputRange: unknown[] }
}
interface Timing {
  finish: (finished?: boolean) => void
}
interface Rendered {
  type: string
  props: Record<string, unknown>
  children: Rendered[] | null
}
interface Root {
  toJSON: () => Rendered | null
  update: (element: unknown) => void
  unmount: () => void
}

const stub = require('./react-native-stub.js') as {
  Animated: { __hozoTimings: Timing[]; __hozoResetTimings: () => void }
}
const react = require('react') as {
  createElement: (type: unknown, props?: unknown, ...children: unknown[]) => unknown
}
const renderer = require('react-test-renderer') as {
  create: (element: unknown, options?: { createNodeMock?: () => unknown }) => Root
  act: (callback: () => void | Promise<void>) => void | Promise<void>
}
const { HozoAnimated } = require('@hozo/primitives/generated/animated') as {
  HozoAnimated: unknown
}
const { Presence: NativePresence } = (await import('@hozo/primitives')) as {
  Presence: unknown
}

const TRANSITION = { duration: 200, delay: 0, easing: 'ease-out' }

function nativeTree(show: boolean, extra: Record<string, unknown> = {}) {
  return react.createElement(
    NativePresence,
    { show },
    react.createElement(HozoAnimated, {
      style: { opacity: 1 },
      hozoExit: { opacity: 0, transform: [{ translateY: 16 }] },
      hozoTransition: TRANSITION,
      ...extra,
    }),
  )
}

function mount(element: unknown, options?: { createNodeMock?: () => unknown }): Root {
  stub.Animated.__hozoResetTimings()
  let root: Root | undefined
  renderer.act(() => {
    root = renderer.create(element, options)
  })
  assert.ok(root)
  return root
}

function update(root: Root, element: unknown) {
  renderer.act(() => root.update(element))
}

/** The animated overrides `HozoAnimated` lays over the flat style. */
function overridesOf(node: Rendered | null): Record<string, unknown> {
  const style = node?.props.style
  assert.ok(Array.isArray(style), `expected [flat, overrides], got ${JSON.stringify(style)}`)
  return (style[1] ?? {}) as Record<string, unknown>
}

test('native: closing animates to the exit style and stays mounted until it ends', () => {
  const root = mount(nativeTree(true))
  update(root, nativeTree(false))

  const overrides = overridesOf(root.toJSON())
  const opacity = overrides.opacity as Interpolation | undefined
  assert.deepEqual(opacity?.__animatedInterpolation.outputRange, [1, 0], 'did not fade out')
  const transform = overrides.transform as { translateY: Interpolation }[] | undefined
  assert.deepEqual(transform?.[0]?.translateY.__animatedInterpolation.outputRange, [0, 16])
  assert.notEqual(root.toJSON(), null, 'removed before the exit ran')

  const exit = stub.Animated.__hozoTimings.at(-1)
  renderer.act(() => exit?.finish())
  assert.equal(root.toJSON(), null, 'still mounted after the exit ended')
  renderer.act(() => root.unmount())
})

test('native: an interrupted exit does not remove the element', () => {
  const root = mount(nativeTree(true))
  update(root, nativeTree(false))
  const exit = stub.Animated.__hozoTimings.at(-1)
  renderer.act(() => exit?.finish(false))
  assert.notEqual(root.toJSON(), null, 'an animation that was stopped counted as finished')
  renderer.act(() => root.unmount())
})

test('native: shown again before the exit ends, it stays', () => {
  const root = mount(nativeTree(true))
  update(root, nativeTree(false))
  const exit = stub.Animated.__hozoTimings.at(-1)
  update(root, nativeTree(true))
  renderer.act(() => exit?.finish())
  assert.notEqual(root.toJSON(), null, 'the old exit removed an element that is shown')
  renderer.act(() => root.unmount())
})

test('native: with nothing to animate out, closing removes the child at once', () => {
  const root = mount(nativeTree(true, { hozoExit: undefined }))
  update(root, nativeTree(false, { hozoExit: undefined }))
  assert.equal(root.toJSON(), null)
  renderer.act(() => root.unmount())
})

test('native: an exit that never reports is given up on', async () => {
  const root = mount(nativeTree(true))
  update(root, nativeTree(false))
  await renderer.act(() => new Promise((resolve) => setTimeout(resolve, TRANSITION.duration + 150)))
  assert.equal(root.toJSON(), null, 'waited for good')
  renderer.act(() => root.unmount())
})

// The Web half: `usePresence` from `@hozo/behaviors`, which `Presence` and
// the Web overlays are built on. Loaded from the built file, because in this
// harness the package name resolves to its Native entry.
const webEntry = path.join(
  path.dirname(require.resolve('@hozo/behaviors/package.json')),
  'dist',
  'presence.js',
)
const { usePresence } = (await import(pathToFileURL(webEntry).href)) as {
  usePresence: (show: boolean) => {
    mounted: boolean
    state: string
    ref: (node: unknown) => void
    onTransitionEnd: (event: unknown) => void
    onAnimationEnd: (event: unknown) => void
  }
}

/** What `Presence` does with the hook, around one element. */
function WebPresence({ show }: { show: boolean }) {
  const presence = usePresence(show)
  if (!presence.mounted) return null
  return react.createElement(
    'div',
    {
      className: 'hozo-0',
      'data-state': presence.state,
      ref: presence.ref,
      onTransitionEnd: presence.onTransitionEnd,
      onAnimationEnd: presence.onAnimationEnd,
    },
    'card',
  )
}

function webTree(show: boolean) {
  return react.createElement(WebPresence, { show })
}

/** A computed style with a 200ms transition, or none. */
function withComputedStyle(duration: string, run: () => void | Promise<void>) {
  const previous = (globalThis as Record<string, unknown>).getComputedStyle
  ;(globalThis as Record<string, unknown>).getComputedStyle = () => ({
    transitionDuration: duration,
    transitionDelay: '0s',
    animationName: 'none',
    animationDuration: '0s',
    animationDelay: '0s',
  })
  const restore = () => {
    ;(globalThis as Record<string, unknown>).getComputedStyle = previous
  }
  const result = run()
  if (result instanceof Promise) return result.finally(restore)
  restore()
  return result
}

const nodeMock = { createNodeMock: () => ({}) }

test('web: the child carries data-state, open and then closed', () => {
  withComputedStyle('0.2s', () => {
    const root = mount(webTree(true), nodeMock)
    assert.equal(root.toJSON()?.props['data-state'], 'open')
    update(root, webTree(false))
    assert.equal(root.toJSON()?.props['data-state'], 'closed', 'removed before the exit ran')
    renderer.act(() => root.unmount())
  })
})

test('web: the element goes when its transition ends', async () => {
  await withComputedStyle('0.2s', async () => {
    const root = mount(webTree(true), nodeMock)
    update(root, webTree(false))
    const node = root.toJSON()
    assert.ok(node)
    // Too early: another property ending first is not the exit ending.
    renderer.act(() => {
      ;(node.props.onTransitionEnd as (event: unknown) => void)({ target: 1, currentTarget: 1 })
    })
    assert.notEqual(root.toJSON(), null, 'the first property to end removed the element')
    await renderer.act(() => new Promise((resolve) => setTimeout(resolve, 200)))
    const later = root.toJSON()
    if (later) {
      renderer.act(() => {
        ;(later.props.onTransitionEnd as (event: unknown) => void)({ target: 1, currentTarget: 1 })
      })
    }
    assert.equal(root.toJSON(), null, 'still mounted after the transition ended')
    renderer.act(() => root.unmount())
  })
})

test('web: a transition from a descendant is not the exit', async () => {
  await withComputedStyle('0.2s', async () => {
    const root = mount(webTree(true), nodeMock)
    update(root, webTree(false))
    await renderer.act(() => new Promise((resolve) => setTimeout(resolve, 200)))
    const node = root.toJSON()
    if (node) {
      renderer.act(() => {
        ;(node.props.onTransitionEnd as (event: unknown) => void)({ target: 2, currentTarget: 1 })
      })
    }
    assert.notEqual(root.toJSON(), null, 'a bubbled transitionend removed the element')
    renderer.act(() => root.unmount())
  })
})

test('web: with no transition, closing removes the child at once', () => {
  // Including under `motion-reduce:transition-none`, which computes to 0s.
  withComputedStyle('0s', () => {
    const root = mount(webTree(true), nodeMock)
    update(root, webTree(false))
    assert.equal(root.toJSON(), null)
    renderer.act(() => root.unmount())
  })
})

// Hozo's own Native popover fades in and out with the same timing, so a
// panel does not close as a fade on the Web and a cut here.
const { HozoPopover } = (await import('@hozo/patterns')) as { HozoPopover: unknown }

interface Instance {
  type: unknown
  props: Record<string, unknown>
  findAll: (predicate: (node: Instance) => boolean) => Instance[]
}

function popover(root: Root) {
  const tree = (root as unknown as { root: Instance }).root
  const trigger = tree.findAll((node) => node.type === 'Pressable')[0]
  const panel = tree.findAll(
    (node) => node.type === 'Animated.View' && node.props.accessibilityLabel === 'Shipping',
  )[0]
  return { trigger, panel }
}

function press(root: Root) {
  const onPress = popover(root).trigger?.props.onPress
  assert.equal(typeof onPress, 'function', 'no trigger to press')
  ;(onPress as () => void)()
}

test('native popover: opens with a fade in, and fades out before it goes', () => {
  const root = mount(
    react.createElement(HozoPopover, { trigger: 'Open', accessibilityLabel: 'Shipping' }, 'Body'),
  )
  renderer.act(() => press(root))
  const opened = popover(root)
  assert.ok(opened.panel, 'the panel did not open')
  const fadeIn = stub.Animated.__hozoTimings.at(-1) as unknown as { config: { toValue: number } }
  assert.equal(fadeIn.config.toValue, 1, 'it did not fade in')

  renderer.act(() => press(root))
  const leaving = popover(root)
  assert.ok(leaving.panel, 'removed before it faded out')
  assert.equal(leaving.panel?.props.pointerEvents, 'none', 'a leaving panel still takes presses')
  assert.equal(leaving.panel?.props.importantForAccessibility, 'no-hide-descendants')
  const fadeOut = stub.Animated.__hozoTimings.at(-1) as unknown as Timing & {
    config: { toValue: number }
  }
  assert.equal(fadeOut.config.toValue, 0, 'it did not fade out')

  renderer.act(() => fadeOut.finish())
  assert.equal(popover(root).panel, undefined, 'still there after the fade ended')
  renderer.act(() => root.unmount())
})
