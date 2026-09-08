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

import { renderNative, type Tree } from './native-render.ts'

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
  // Directly, rather than through the compiler: `@hozo/runtime` is a
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
  const { HozoPressable } = require('../../runtime/src/pressable.native.tsx') as {
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
