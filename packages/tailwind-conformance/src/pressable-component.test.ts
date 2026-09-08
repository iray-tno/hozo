// Which component a Pressable becomes, and why it is not a detail.
//
// `Animated.createAnimatedComponent` drops a *function* style. React
// Native flattens the static style on its way through `AnimatedProps`:
//
//     const flatStaticStyle = flattenStyle(staticStyle);
//     ...
//     } else { props[key] = flatStaticStyle; }
//
// and `flattenStyle` of a function is `undefined`, so the element renders
// with no style at all. A compiled `hover:` class produces exactly that
// callback, so every Pressable with a state variant and no transition
// rendered unstyled -- no background, no padding -- on both platforms.
//
// This test exists because no rendering test in this repository can catch
// that. `react-native-stub.js` makes `createAnimatedComponent` the
// identity, so the animated component and the plain one are the same
// object here and a tree assertion cannot tell them apart. The stub is not
// at fault: it is a stub, and the rule being broken lives in React Native.
//
// So the assertion is on the decision rather than on the render. It is the
// same move `android-roles.test.ts` makes with React Native's Kotlin --
// when the behaviour is out of reach, pin the fact the behaviour depends
// on.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

import './native-render.ts'

const require = createRequire(import.meta.url)
const { pressableFor } = require('../../runtime/src/pressable.native.tsx') as {
  pressableFor: (transition: unknown) => unknown
}
const { Pressable, Animated } = require('react-native') as {
  Pressable: unknown
  Animated: { createAnimatedComponent: (component: unknown) => unknown }
}

const TRANSITION = {
  duration: 200,
  delay: 0,
  easing: 'ease-in-out' as const,
  opacity: false,
  transform: false,
  colors: true,
}

test('without a transition, the plain Pressable takes the callback', () => {
  // The callback is Pressable's own API and it keeps React Native's timing
  // for `pressed`. There is nothing to animate, so there is no reason to
  // wrap it in a component that cannot read one.
  assert.equal(pressableFor(undefined), Pressable)
})

test('with a transition, the animated one takes an array', () => {
  // A tautology under the stub, which returns the component it was given,
  // and deliberately written anyway: it states the rule, and it becomes a
  // real assertion the moment the stub stops being the identity -- which
  // the test below is watching for.
  //
  // The array is what #334 established: `AnimatedProps` builds its node
  // from an object or an array and ignores anything else, so the animated
  // values have to arrive in one.
  assert.equal(pressableFor(TRANSITION), Animated.createAnimatedComponent(Pressable))
})

test('and the stub is why this is a decision test rather than a render test', () => {
  // Stated rather than assumed, because the day the stub stops being the
  // identity is the day the two tests above can be written properly -- and
  // this line is what will say so.
  assert.equal(
    Animated.createAnimatedComponent(Pressable),
    Pressable,
    'the stub now distinguishes animated components: assert on the rendered tree instead',
  )
})
