// What a `space-*` parent does to a child whose style is a callback.
//
// `HozoSpaced` puts the parent's spacing behind each child's own style by
// cloning the child with `style: [spacing, child.props.style]`. That is
// right for an object and wrong for a function: React Native flattens the
// array, finds a function where a style object belongs, and skips it. The
// child then renders with the spacing and nothing else.
//
// The compiler emits a callback style for any element with a state
// variant, so `<Pressable className="bg-brand p-3 hover:bg-blue-700">`
// inside a `space-y-4` container rendered with no background, no padding
// and no radius -- which is exactly what the acceptance screen's Continue
// button did, on both platforms, for as long as that screen has existed.
//
// Six probes found it by elimination (#357): every ingredient of that
// button drew correctly on a screen whose container uses `gap-*`,
// including one copied prop for prop. The container was the last
// difference left.
//
// This test is reachable where the others were not. It is plain React --
// what one component passes to another -- so no part of it depends on the
// stub being faithful about anything.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

import './native-render.ts'

const require = createRequire(import.meta.url)
const react = require('react') as {
  createElement: (type: unknown, props?: unknown, ...children: unknown[]) => unknown
}
const renderer = require('react-test-renderer') as {
  create: (element: unknown) => { toJSON: () => { props: Record<string, unknown> } }
  act: (callback: () => void) => void
}
const { HozoSpaced } = require('../../runtime/src/spacing.native.tsx') as {
  HozoSpaced: unknown
}

const SPACING = { marginTop: 16 }
const OWN = { backgroundColor: '#3581f6', padding: 12 }

/** The style a spaced child is actually handed. */
function styleOf(childStyle: unknown): unknown {
  let root: { toJSON: () => { props: Record<string, unknown> } } | undefined
  renderer.act(() => {
    root = renderer.create(
      react.createElement(
        HozoSpaced,
        { style: SPACING },
        // Every element but the last is a target -- the gap goes *after*
        // each child that has one below it -- so the child under test
        // comes first and a plain one follows it.
        react.createElement('View', { testID: 'spaced', style: childStyle }),
        react.createElement('View', { testID: 'last' }),
      ),
    )
  })
  const tree = (root as { toJSON: () => unknown }).toJSON() as { props: Record<string, unknown> }[]
  const spaced = tree.find((node) => node.props.testID === 'spaced')
  assert.ok(spaced, 'the spaced child did not render')
  return spaced.props.style
}

test('an object style is composed behind the spacing, as before', () => {
  assert.deepEqual(styleOf(OWN), [SPACING, OWN])
})

test('a callback style stays a callback, and still gets the spacing', () => {
  // The fix. A function in an array is not composed with anything -- it is
  // skipped, and everything the callback would have returned is lost.
  const style = styleOf((state: { hovered?: boolean }) => [
    OWN,
    state.hovered && { backgroundColor: '#1447e6' },
  ])
  assert.equal(typeof style, 'function', 'the callback was wrapped instead of composed')

  const resolved = (style as (state: unknown) => unknown[])({ hovered: false })
  assert.deepEqual(resolved, [SPACING, [OWN, false]])
})

test('and the state reaches the child’s own callback', () => {
  // Composing by calling it is only correct if what it is called with is
  // what React Native would have called it with.
  const style = styleOf((state: { hovered?: boolean }) => [
    OWN,
    state.hovered && { backgroundColor: '#1447e6' },
  ]) as (state: unknown) => unknown[]
  assert.deepEqual(style({ hovered: true }), [SPACING, [OWN, { backgroundColor: '#1447e6' }]])
})

test('the child’s own style still wins, whichever shape it has', () => {
  // The rule `HozoSpaced` documents: spacing behind, so a child's own
  // `mt-8` beats the parent's `space-y-4`. Order is what says so, and the
  // callback path has to keep it.
  const object = styleOf(OWN) as unknown[]
  assert.equal(object[0], SPACING)
  const callback = styleOf(() => OWN) as (state: unknown) => unknown[]
  assert.equal(callback({})[0], SPACING)
})
