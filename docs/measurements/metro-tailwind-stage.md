# Staging the full Metro Native transform

An independent follow-up on main `7debbf18` adds internal
`transformHozoSourceOrPrepare` at the actual post-Canvas boundary. The existing
synchronous `transformHozoSource` and the staged path share one finalizer for
the **complete Native module**, not only its component array: module diagnostics,
foreign/import metadata, Native StyleSheet namespaces, root edits, hook slots,
runtime/SVG/candidate imports and import-collision checks. A complete ready
context emits directly; a miss owns that exact prepared module plus its source
continuation until one-shot emission/disposal. No ordinary primitive/metadata
reparse or global context installation is used by the staged path.

Seven new tests compare full source and diagnostic output across multiple
roots, responsive/dark hooks, aliases/foreign bindings, text/Unicode, SVG,
dynamic candidates, secondary pattern slots, Canvas-only/no-op and syntax-error
modules. They exercise actual cold/ready session calls after Canvas rewriting,
prohibit ordinary reparsing and ready wait signals, retain helpers/imported
StyleX/text-forwarding facts across mutation, preserve hard errors and collision
checks, and reject cancelled/duplicate/after-disposal emission. An initial hard
error fixture used `block`, which ordinary Native lowering no longer rejects;
it was corrected to the existing `inline-block` refusal. The original failed
probe is kept; no production diagnostic was weakened to make the test pass.

Validation uses CPU 1 / Idle with test concurrency 1. Metro **83 passed**, Native
Showcase unit/driver-policy **223 passed plus one existing skip**, source-cache
guards **9 passed**. Compiler/Tailwind/Metro builds, lint (**1,682 files**), docs
and fixture generation/check passed. The addon was rebuilt on the main baseline
before final validation. The Native text fixture changes **one Metro source
hash only**, not its compiled component. A brief generator/test overlap occurred
while checking the build result; no timing is used as benchmark evidence, and
remaining validation was serialized. Logs remain under
`artifacts/tailwind-order/metro-stage-*`.

The existing Metro default still calls the synchronous entry. This layer does
**not** install worker sessions, project CSS/import invalidation or generated
candidate-universe reconciliation. Its ordinary path has an extra build-time
callback/shared-function boundary; there is no zero-overhead or transform-speedup
claim and no repeated microbenchmark. No device resolver, new cascade winner,
coverage denominator or supported/refused utility changed. It does not depend
on the unmerged Vite PR #1275. The separate iOS HID failure is tracked in #1279,
not claimed fixed by Native compiler staging.

No local full-root packing/application suite, real Metro bundle, fresh device
pixels/AT, startup/peak memory or production/WASM artifact-size claim. CI checks
the broader integration. Actual worker/config epoch ownership and complete
candidate reconciliation remain required before switching Metro defaults.
