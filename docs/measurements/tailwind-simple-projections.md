# More existing utilities use the common ordering plan

## Change

Above #1339/#1340, twelve additional property types can now participate in
the same original-rule scalar plan: opacity, numeric z-index, flex direction,
grow/shrink, items/self/content/justify alignment, text alignment, text
transformation and normal/italic font style. Their accepted values have direct
single-key projections on both backends. Unsupported alignment values and
`z-auto` are not silently included.

There is one shared CSS ownership/projection definition in `hozo_ir`, used by
both static ordering and generated-candidate assessment. It contains property
correspondence, not precedence numbers or utility-family sorters. Priority
still comes from actual captured Tailwind rule signatures. Physical spacing
continues to use its existing assessed shorthand ownership; no Native-only
ordering policy or device-time branch is introduced.

Previously, an otherwise assessed `p-4 p-2` input would remain on old string
order merely because it also contained one of these simple properties. Those
inputs can now use the shared order. The change does not let known writes
jump across unknown writes, captured author expressions or other frontend
input boundaries.

## Cache identity

Eligibility expansion changes actual output even when CSS descriptors and the
comparison algorithm do not change. The output policy is therefore now
`scalar-order-v2`, not v1. Native fingerprints and captured plan mode share
the Rust policy constant. The matching internal JS constant is checked
against real prepared output. Metro uses that identity in its transferred,
content-addressed startup snapshot and refuses a validly hashed old-policy
transfer. Old map/static caches must not survive a domain change just because
their stylesheet/candidate bytes stayed identical. The generated resolver's
object ABI remains schema 1; no new runtime protocol is needed.

## Evidence

The Tailwind package test uses real upstream descriptors and compiler output
for twelve conflicting class pairs in both orders, each also containing the
old wrong-winner spacing control. Actual candidate groups must be orderable;
the emitted static Native values must equal the executed generated map. Web
output must be invariant to string reversal. Legacy emission remains an
explicit negative control.

A real-browser probe compares upstream Tailwind CSS, emitted Web CSS, actual
Native static owner props and the actual generated resolver. It checks
**64 owner observations** across both class orders and adds overlapping
focus/active/hover+focus opacity conditions. Text alignment/transformation
are read through the actual generated label prop; font style is checked on
a real Text owner rather than an empty layout host. This is emitted-style
and browser evidence, not RN device pixels or a parent-inheritance verdict.

Two initial browser expectations read the wrong owner: text alignment was
looked up on the Pressable host rather than its generated label frame, then
font style was assumed to use that same label frame. Inspecting actual JSX
identified both probe mistakes. The corrected probe reads the actual label
prop where emitted and uses Text for font style. Original failure logs are
retained; no assertion was weakened to accept a wrong winner and neither
failure was classified as a flake.

Negative cases keep font-weight registrations, compound text metrics, gap
aliases and transform registers on their old whole-input path. Rust tests
also verify exact CSS write ownership and reject unassessed value shapes.
The generated Native text fixture is regenerated for changed source receipts;
its scenario output is not repurposed to claim a new device run.

Reproduce after a fresh native addon and package build:

```sh
cargo test --workspace
pnpm --filter @hozo/compiler build:native
pnpm --filter @hozo/compiler build
pnpm --filter @hozo/metro build
pnpm --filter @hozo/tailwind exec node --test --test-concurrency=1 'src/*.test.ts'
node --test --test-concurrency=1 --test-name-pattern="simple projected properties|generated common-plan resolver|canonical-order reference" examples/storybook-demo/scripts/caller-composition.test.mjs
node examples/native-showcase/scripts/generate-text-inheritance.mjs --check
```

Local logs live under `artifacts/tailwind-order/namespace-invariance/simple-*`.
The full Rust workspace and freshly rebuilt addon passed before JS validation.
Local results: Rust **1,071 passed, one intentional ignored cost probe**;
Tailwind **140/140**, Metro **91/91**, Vite **62/62**, Next **21/21**;
compiler **358 passed, one existing skip**. Three focused browser tests and
sixteen Native-fixture/cache guards passed without skips. Repository Biome
checked 1,719 files; generated docs and rustfmt checks passed.

## Cost and remaining work

No engine/resolver render loop, template cache or state-selection code changes.
The existing debug Rust plan probe, CPU 1/Idle, nine alternating samples of
200 calls per route, measured pass-through/ordered medians of 0.171/0.201 us
for one write, 0.750/9.719 us for sixteen and 5.344/70.183 us for 128. These
include input cloning and the complete ordering plan. They are **not** a
parent-versus-this-change comparison or a production/device speed claim.

This is another real expansion of defaults, not completion of RFC 007. Next
are font registration and font-size/line-height/letter-spacing composition,
then gap/logical alias normalization and transform/register units. Their
backend normalization cannot be fixed by merely permitting another property
name. Portable standalone defaults also remain separate; existing generated
facts are not a complete substitute for a project's captured CSS context.
No fresh full-app/device/AT result or overall conformance percentage is
inferred from these focused checks.
