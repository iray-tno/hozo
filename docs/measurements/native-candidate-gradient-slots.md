# Gradient registers in the Native candidate map

Continues #1230 / RFC010 after
[static conditional gradients](native-conditional-gradient-slots.md).
No owner admission, default routing, audit promotion or ordering policy change.

## Failure and repair

The old map kept a constructor's transparent ramp and dropped unconditional
stop-only utilities as `no-native-output`; state stop writers became empty
objects. Before rebuilding the addon, five new generated-module tests failed,
with two direct-path/refusal controls passing.

Candidate generation now reuses the static gradient metadata writer and
generated leaf. Stop-only classes survive as metadata-only objects, without a
fake `backgroundImage: none` reset. The module indexes actual style/state
object identities once. Selected non-gradient lists bypass composition, and
unconditional results retain resolver caching. Constructor-only namespaces
retain whole-image replacement without importing the helper.

The build-time schema-1 sidecar gains an additive `compositionKeys` field:
actual independent register writes, in a disjoint space from `nativeKeys`.
For a colour-only utility, Native keys honestly remain empty. Its actual
metadata field still participates in conflict detection, so two colours or
positions receive the existing assessed Tailwind ranks even without any
unrelated padding conflict. Constructors already have the real
`backgroundImage` key. No descriptors or `compositionKeys` enter device output.

**Deletion receipt:** removed the early no-output rejection for emitted
gradient metadata, and replaced the duplicate filter/text/transform branching
with one ordered selected-object pipeline. No second classifier/ranker or
new runtime subscription was added. The whole-property paths for unsupported
syntax and mixed static/dynamic boundaries remain active follow-ups, not dead
reference branches.

## Evidence and limits

- `packages/compiler/src/candidate-gradients.test.ts` executes generated maps,
  reversed class strings, metadata-only stops, caching, inactive/stacked
  conditions, none/via removal, text/filter/transform coexistence, fast paths,
  a compiled dynamic Pressable callback and refusal controls. An identity
  composer still loses the stops.
- `packages/tailwind/src/native-candidate-gradients.test.ts` obtains actual
  Tailwind priorities, checks honest Native/register-key evidence without an
  unrelated scalar conflict, and compares emitted static and dynamic Native
  results over both class orders and all eight hover/focus/active states.
  This is shared-priority/declaration evidence, not an independent GPU oracle.
- Under CPU1 / Idle / serial: Native 365 tests; compiler 533 passed / two
  skipped; complete Tailwind suite 252 passed, including nine targeted
  priority/gradient tests. Fresh addon, scoped all-target Clippy and compiler /
  Tailwind typechecks passed; NAPI unit suite 15 passed. Full root/workspace
  validation stays on CI.

Node 25/debug addon: plain `p-4 hover:opacity-50` module 500 raw/290 gzip
bytes; adding a linear constructor and hover/focus colour writers is 1,229/569
(plus the lower layer's shared 460-gzip-byte leaf). Warm 50,000-call state
loops took 26.54ms for the plain map, 21.55ms for the same plain selection in
the gradient-bearing map, and 92.78ms for the active gradient selection;
checksums 100,000/100,000/300,000. These are single local loops, not proof of
a plain-path speedup, device frame time or an application regression budget.

Native runtime `md:`/`dark:`, conic and raw arbitrary CSS images retain their
existing refusal boundary. Interpolation-space/device pixels, animation,
shadow/drop-shadow and mixed static/dynamic composition are not certified.
The earlier helper unit tests, including opaque style IDs, remain maintained
regressions. This does not promote a global coverage or six-axis score.
