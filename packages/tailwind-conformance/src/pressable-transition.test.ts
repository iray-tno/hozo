// What actually reaches the view when a compiled Pressable has a
// transition.
//
// `HozoPressable` handed React Native a *callback* for `style`, which is
// what Pressable's own API takes, and put the animated values in what that
// callback returned. React Native builds its animated node from
// `props.style` in `AnimatedProps.js`, and its first act is:
//
//     if (key === 'style') {
//       // Ignore `style` if it is not an object (or array).
//       if (typeof value === 'object' && value != null) {
//
// So no node was ever attached. Pressable still called the callback, so
// the `Animated.Value`s went to the view as plain objects in the places
// colours and numbers belong -- and `backgroundColor: <object>` is not a
// colour, so the view dropped it.
//
// The visible result: `<Pressable className="bg-brand transition-colors">`
// rendered with **no background**, and its white label became invisible
// against the page. Every colour transition on a compiled Pressable, on
// both platforms, for as long as the code existed.
//
// Nothing caught it because every test of this asked what the component
// passes down, and it passed down exactly what it meant to. The first
// screenshot anything ever took of the acceptance screen showed a button
// that was not there (#297).
//
// So this test asks the last question instead: is the style a shape React
// Native can attach an animated node to, and does that shape still carry
// the colour the compiler resolved?

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

import { loadNativeModule, renderNative, type Tree } from './native-render.ts'

const require = createRequire(import.meta.url)

/** A style prop as React Native resolves it: an array, flattened, last wins. */
function flatten(style: unknown): Record<string, unknown> {
  if (typeof style === 'function') return { __callback: true }
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flatten))
  return (style ?? {}) as Record<string, unknown>
}

function find(tree: Tree, testID: string): Tree {
  if (!tree) return null
  if (tree.props?.testID === testID) return tree
  for (const child of tree.children ?? []) {
    if (typeof child === 'object' && child !== null) {
      const found = find(child, testID)
      if (found) return found
    }
  }
  return null
}

/** The acceptance screen's Continue button, near enough to be the same bug. */
const SOURCE = `
import { Pressable, Text } from '@hozo/core'
export function Button() {
  return (
    <Pressable
      className="rounded-lg bg-blue-600 p-3 transition-colors duration-200 hover:bg-blue-700"
      testID="continue"
    >
      <Text className="font-bold text-white">Continue</Text>
    </Pressable>
  )
}
`

test('the style React Native is given is one it can attach a node to', () => {
  // The crux. A callback here means no animated node, and no animated node
  // means the values below reach the view as plain objects. This is the
  // assertion that fails on the old code.
  const button = find(renderNative(SOURCE, 'Button'), 'continue')
  assert.ok(button, 'the compiled button did not render')
  assert.notEqual(
    typeof button.props.style,
    'function',
    'style is a callback, so `AnimatedProps` skips it and the transition reaches the view raw',
  )
})

test('and the resolved background is still in it', () => {
  // The other half of the same array: React Native interpolates *from*
  // the style it was given, so the compiled colour has to be there as a
  // colour. A fix that dropped it would satisfy the test above.
  const button = find(renderNative(SOURCE, 'Button'), 'continue')
  const parts = (Array.isArray(button?.props.style) ? button.props.style : []).flat(9)
  const resolved = parts.find(
    (part) => typeof (part as Record<string, unknown>)?.backgroundColor === 'string',
  ) as Record<string, unknown> | undefined
  assert.ok(resolved, 'no plain backgroundColor anywhere in the style')
  assert.equal(resolved.backgroundColor, '#155dfc')
})

test('and so is the animated one, or the transition does nothing', () => {
  // A fix that dropped the animation would also pass both tests above.
  // The stub's `interpolate` returns a tagged object, so the animated
  // entry is identifiable.
  const button = find(renderNative(SOURCE, 'Button'), 'continue')
  const parts = (Array.isArray(button?.props.style) ? button.props.style : []).flat(9)
  const animated = parts.find(
    (part) => typeof (part as Record<string, unknown>)?.backgroundColor === 'object',
  )
  assert.ok(animated, 'no animated backgroundColor: the transition would do nothing')
})

test('without a transition the callback is still the callback', () => {
  // Not "never pass a function". With no animated values in play there is
  // no node to attach, and the callback is what gives `pressed` React
  // Native's own timing -- `hover:` still needs the state, so the style is
  // still state-dependent, and it is still a callback.
  const source = SOURCE.replace(' transition-colors duration-200', '')
  const button = find(renderNative(source, 'Button'), 'continue')
  assert.equal(typeof button?.props.style, 'function')
})

test('the runtime component keeps the base style under an animated one', () => {
  // Directly, rather than through the compiler: `@hozo/engine` is a
  // published package and a hand-written `HozoPressable` has the same
  // contract. Two entries -- the resolved style and the animated
  // overrides -- and the resolved one still carries the colour.
  const react = require('react') as {
    createElement: (type: unknown, props?: unknown, ...children: unknown[]) => unknown
  }
  const renderer = require('react-test-renderer') as {
    create: (element: unknown) => { toJSON: () => Tree }
    act: (callback: () => void) => void
  }
  const { HozoPressable } = require('../../primitives/src/pressable.native.tsx') as {
    HozoPressable: unknown
  }

  let root: { toJSON: () => Tree } | undefined
  renderer.act(() => {
    root = renderer.create(
      react.createElement(HozoPressable, {
        testID: 'plain',
        style: () => ({ backgroundColor: '#3581f6' }),
        hozoTransition: {
          duration: 200,
          delay: 0,
          easing: 'ease-in-out',
          opacity: false,
          transform: false,
          colors: true,
        },
      }),
    )
  })
  const style = flatten((root as { toJSON: () => Tree }).toJSON()?.props.style)
  assert.equal(style.__callback, undefined)
  assert.equal(typeof style.backgroundColor, 'object', 'the animated value should win at the end')
})

test('toggling disabled on a compiled transition-colors Pressable retargets backgroundColor without resetting progress (#2273)', () => {
  const { Animated } = require('react-native') as {
    Animated: {
      __hozoTimings: Array<{
        value: { value: number; setValue: (v: number) => void }
        config: { toValue: number; useNativeDriver: boolean }
      }>
      __hozoResetTimings: () => void
    }
  }
  const { blendColor } = require('@hozo/engine') as {
    blendColor: (from: string, to: string, fraction: number) => string
  }
  const react = require('react') as {
    createElement: (type: unknown, props?: unknown, ...children: unknown[]) => unknown
  }
  const renderer = require('react-test-renderer') as {
    create: (element: unknown) => {
      toJSON: () => Tree
      update: (element: unknown) => void
      unmount: () => void
    }
    act: (callback: () => void) => void
  }

  const compiled = loadNativeModule(`
import { Pressable, Text } from '@hozo/core'
export function GateButton({ disabled }: { disabled: boolean }) {
  return (
    <Pressable
      disabled={disabled}
      className="rounded-lg bg-blue-600 p-3 transition-colors duration-200 hover:bg-blue-700 disabled:bg-slate-200"
      testID="gate"
    >
      <Text className="font-bold text-white">Approve</Text>
    </Pressable>
  )
}
`)

  Animated.__hozoResetTimings()
  let root:
    | { toJSON: () => Tree; update: (element: unknown) => void; unmount: () => void }
    | undefined
  const readBg = () => {
    const button = find(root!.toJSON(), 'gate')
    assert.ok(button, 'compiled gate button missing')
    return flatten(button.props.style).backgroundColor as {
      __animatedInterpolation: { inputRange: number[]; outputRange: string[] }
    }
  }

  try {
    renderer.act(() => {
      root = renderer.create(react.createElement(compiled.GateButton, { disabled: true }))
    })
    assert.equal(Animated.__hozoTimings.length, 0, 'mount must not start an animation')
    assert.deepEqual(readBg().__animatedInterpolation, {
      inputRange: [0, 1],
      outputRange: ['#e2e8f0', '#e2e8f0'],
    })

    // Toggling `disabled` from true -> false without any pointer event must
    // transition the animated background from disabled slate to active blue.
    renderer.act(() => {
      root!.update(react.createElement(compiled.GateButton, { disabled: false }))
    })
    assert.equal(Animated.__hozoTimings.length, 1)
    assert.equal(Animated.__hozoTimings[0].config.toValue, 1)
    assert.equal(Animated.__hozoTimings[0].config.useNativeDriver, false)
    assert.deepEqual(readBg().__animatedInterpolation, {
      inputRange: [0, 1],
      outputRange: ['#e2e8f0', '#155dfc'],
    })

    // Re-disabling mid-flight blends from the observed position without
    // resetting progress to zero.
    const progressNode = Animated.__hozoTimings[0].value
    renderer.act(() => progressNode.setValue(0.5))
    renderer.act(() => {
      root!.update(react.createElement(compiled.GateButton, { disabled: true }))
    })
    assert.equal(progressNode.value, 0.5, 'retargeting must not reset progress to zero')
    assert.equal(Animated.__hozoTimings.length, 2)
    assert.equal(Animated.__hozoTimings[1].config.toValue, 1.5)
    assert.deepEqual(readBg().__animatedInterpolation, {
      inputRange: [0.5, 1.5],
      outputRange: [blendColor('#e2e8f0', '#155dfc', 0.5), '#e2e8f0'],
    })

    // Re-rendering with the same disabled prop must not restart the animation.
    renderer.act(() => {
      root!.update(react.createElement(compiled.GateButton, { disabled: true }))
    })
    assert.equal(Animated.__hozoTimings.length, 2)
  } finally {
    renderer.act(() => root?.unmount())
  }
})

test('non-interaction opacity, transform, and static style prop changes retarget without doubling interaction timings (#2273)', () => {
  const { Animated } = require('react-native') as {
    Animated: {
      __hozoTimings: Array<{
        value: { value: number }
        config: { toValue: number; useNativeDriver: boolean }
      }>
      __hozoResetTimings: () => void
    }
  }
  const react = require('react') as {
    createElement: (type: unknown, props?: unknown, ...children: unknown[]) => unknown
  }
  const renderer = require('react-test-renderer') as {
    create: (element: unknown) => {
      root: { findByType: (type: string) => { props: Record<string, unknown> } }
      toJSON: () => Tree
      update: (element: unknown) => void
      unmount: () => void
    }
    act: (callback: () => void) => void
  }
  const { HozoPressable } = require('../../primitives/src/pressable.native.tsx') as {
    HozoPressable: unknown
  }
  const motion = {
    duration: 150,
    delay: 0,
    easing: 'linear',
    opacity: true,
    transform: true,
    colors: true,
  }

  Animated.__hozoResetTimings()
  let root: ReturnType<typeof renderer.create> | undefined
  const renderFn = (locked: boolean) =>
    react.createElement(HozoPressable, {
      hozoTransition: { ...motion },
      disabled: locked,
      style: (state: Record<string, boolean>) => ({
        opacity: locked ? 0.5 : state.pressed ? 0.8 : 1,
        backgroundColor: locked ? '#f1f5f9' : state.hovered ? '#432dd7' : '#4f39f6',
        transform: [{ scale: locked ? 0.95 : 1 }],
      }),
    })

  try {
    renderer.act(() => {
      root = renderer.create(renderFn(true))
    })
    assert.equal(Animated.__hozoTimings.length, 0)

    // Unlocking via prop update animates opacity, scaleX, scaleY, and colour.
    renderer.act(() => root!.update(renderFn(false)))
    assert.equal(Animated.__hozoTimings.length, 4)
    assert.deepEqual(
      Animated.__hozoTimings.map((t) => t.config.toValue),
      [1, 1, 1, 1],
    )

    // Pointer hover runs synchronously once and does not double-start on commit.
    Animated.__hozoResetTimings()
    renderer.act(() => {
      ;(root!.root.findByType('Pressable').props.onHoverIn as (e: unknown) => void)({})
    })
    assert.equal(Animated.__hozoTimings.length, 1, 'hover changed colour only, once')
    const bg = flatten(root!.toJSON()?.props.style).backgroundColor as {
      __animatedInterpolation: { outputRange: string[] }
    }
    assert.equal(bg.__animatedInterpolation.outputRange[1], '#432dd7')
  } finally {
    renderer.act(() => root?.unmount())
  }

  // Plain object styles (not a callback) also retarget on prop changes.
  Animated.__hozoResetTimings()
  let plainRoot: ReturnType<typeof renderer.create> | undefined
  try {
    renderer.act(() => {
      plainRoot = renderer.create(
        react.createElement(HozoPressable, {
          hozoTransition: motion,
          style: { opacity: 0.4, backgroundColor: '#f1f5f9' },
        }),
      )
    })
    assert.equal(Animated.__hozoTimings.length, 0)
    renderer.act(() => {
      plainRoot!.update(
        react.createElement(HozoPressable, {
          hozoTransition: motion,
          style: { opacity: 1, backgroundColor: '#4f39f6' },
        }),
      )
    })
    assert.equal(Animated.__hozoTimings.length, 2)
    const plainBg = flatten(plainRoot!.toJSON()?.props.style).backgroundColor as {
      __animatedInterpolation: { outputRange: string[] }
    }
    assert.deepEqual(plainBg.__animatedInterpolation.outputRange, ['#f1f5f9', '#4f39f6'])
  } finally {
    renderer.act(() => plainRoot?.unmount())
  }
})

for (const strict of [false, true]) {
  test(`an abandoned speculative render does not mutate TransitionPressable colours; strict=${strict} (#2273)`, async () => {
    const { Animated } = require('react-native') as {
      Animated: {
        __hozoTimings: Array<{ value: { value: number }; config: { toValue: number } }>
        __hozoResetTimings: () => void
      }
    }
    const react = require('react') as {
      Fragment: unknown
      StrictMode: unknown
      Suspense: unknown
      startTransition: (cb: () => void) => void
      createElement: (type: unknown, props?: unknown, ...children: unknown[]) => unknown
    }
    const renderer = require('react-test-renderer') as {
      create: (element: unknown) => {
        toJSON: () => Tree
        update: (element: unknown) => void
        unmount: () => void
      }
      act: (callback: () => Promise<void> | void) => Promise<void>
    }
    const { HozoPressable } = require('../../primitives/src/pressable.native.tsx') as {
      HozoPressable: unknown
    }
    const motion = {
      duration: 100,
      delay: 0,
      easing: 'linear',
      opacity: false,
      transform: false,
      colors: true,
    }

    Animated.__hozoResetTimings()
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    const seen: string[] = []
    function Hold({ hold }: { hold: boolean }) {
      if (hold) throw pending
      return null
    }
    function Probe({ bg, hold }: { bg: string; hold: boolean }) {
      seen.push(bg)
      return react.createElement(
        HozoPressable,
        { hozoTransition: motion, style: () => ({ backgroundColor: bg }) },
        react.createElement(Hold, { hold }),
      )
    }
    const scene = (bg: string, hold = false) =>
      react.createElement(
        strict ? react.StrictMode : react.Fragment,
        null,
        react.createElement(
          react.Suspense,
          { fallback: react.createElement('Pending') },
          react.createElement(Probe, { bg, hold }),
        ),
      )

    let root: ReturnType<typeof renderer.create> | undefined
    try {
      await renderer.act(async () => {
        root = renderer.create(scene('#f1f5f9'))
      })
      assert.equal(Animated.__hozoTimings.length, 0)
      await renderer.act(async () => {
        react.startTransition(() => root!.update(scene('#4f39f6', true)))
      })
      assert.ok(seen.includes('#4f39f6'), 'speculative render must actually run')
      assert.equal(Animated.__hozoTimings.length, 0, 'abandoned render must not start a timing')
      const bg = flatten(root!.toJSON()?.props.style).backgroundColor as {
        __animatedInterpolation: { outputRange: string[] }
      }
      assert.deepEqual(bg.__animatedInterpolation.outputRange, ['#f1f5f9', '#f1f5f9'])
      await renderer.act(async () => {
        root!.update(scene('#0000ff', false))
      })
      const committedBg = flatten(root!.toJSON()?.props.style).backgroundColor as {
        __animatedInterpolation: { outputRange: string[] }
      }
      assert.deepEqual(committedBg.__animatedInterpolation.outputRange, ['#f1f5f9', '#0000ff'])
      assert.equal(Animated.__hozoTimings.length, 1)
      await renderer.act(async () => {
        release()
        await pending
      })
      const settledBg = flatten(root!.toJSON()?.props.style).backgroundColor as {
        __animatedInterpolation: { outputRange: string[] }
      }
      assert.equal(settledBg.__animatedInterpolation.outputRange[1], '#0000ff')
      assert.equal(Animated.__hozoTimings.length, 1)
    } finally {
      await renderer.act(async () => {
        root?.unmount()
        release()
      })
    }
  })
}
