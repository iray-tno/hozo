# Native mixed transform slots

React Native treats its transform array as one property. At a non-animated,
spread-free View or Pressable root, compiled transform slots now join selected
runtime slots before producing that array. The existing static resting →
runtime candidate → static owner-state order is unchanged. Authored RN
styles, including registered style IDs, remain last.

`node --test --test-concurrency=1 packages/compiler/src/native-mixed-effect-slots.test.ts packages/compiler/src/transform-resets.test.ts packages/engine/src/transform-slots.test.ts`
executes generated JSX and candidate modules. It checks independent translation
axes, owner reset and release, an authored override, and a transform and gradient
on the same host. The negative control runs candidate composition prematurely
and loses the static axis. The engine also checks that another deferred family
can still see the original candidate identity after transform composition.

Static-only and transform-free sites keep their direct path. This is a
style-output check, not a device-pixel measurement; it does not assess
spreads, secondary owner slots, or animated transform endpoints.
