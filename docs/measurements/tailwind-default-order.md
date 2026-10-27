# Assessed scalar ordering becomes the project default

## Shipping boundary

Vite, Metro and Next now construct scalar-output contexts in their existing
`TailwindProjectSession`. Metro's config-time generated Native candidate map
uses the same policy and captured CSS graph. This is a default change, not
another app flag. Physical spacing, colors and dimensions may use shared
single-rule priorities, including assessed actual owner states. Eligibility
and barriers still live in the common Rust planner.

`p-4 p-2` and `p-2 p-4` both choose `p-4`, as upstream does. Vite writes that
winner during the ordinary transform, before the companion CSS import reaches
Vite's CSS processing. Its actual production CSS asset contains 16px under a
`.25rem` spacing theme. Next writes the same winner from its real loader;
Metro static emission and its actual generated dynamic factory agree under
7px and 11px themes. This is not merely a sidecar reporting the new answer.

Numeric ranks remain local to each complete context/map. Their relative-order
contract under the same epoch is explained and regression-tested in
[namespace invariance](tailwind-namespace-invariance.md). The actual parse
still checks candidate completeness; missing descriptors use retained-parse
preparation, never a guessed rank. CSS/config replacement retires the matching
compiler and session. Metro still requires a restart for a new startup graph.
Its content-addressed transfer includes the policy, invalidating old
pass-through transform-cache epochs even when CSS/candidates are unchanged.

## Removed and retained wiring

Removed `ViteFinalStyleGraph`, its production transform/`buildEnd`/error-hook
wiring and the `final-styles-<environment>.json` output. This eliminates the
whole-graph live-IR retention and second speculative/final style emission from
ordinary Vite builds. No late CSS asset patching or consumed-handle recovery
is necessary for the bounded policy. Old internal artifacts from previous
builds may remain on disk but have no reader and are not updated or shipped.

The deleted graph-specific tests asserted that obsolete ownership protocol;
they are not silently reinterpreted as current shipping guarantees. Their
meaningful output checks are replaced by `vite/src/default-order.test.ts`:
actual assets in both orders, transformed query modules, repeated builds,
CSS epoch replacement, removed-module CSS, unavailable snapshots and late
output errors. Existing epoch/session tests retain supersession, ready/miss,
missing names, imported-CSS changes and cancellation coverage. Existing
candidate-inventory tests retain missing/stale/downstream-mutated receipts,
cached-fact replay and failed-build visibility. No graph-completion JSON is
used to certify an otherwise failed bundle.

Retained the generic finite-batch publisher and one-shot Web style-continuation
API as internal, explicitly exercised bounded/offline capabilities. Their
tests check ownership and no-partial-publication independently of any Vite
lifecycle. Ordinary transforms do not preview and do not use them. Runtime
candidate inventory remains useful independent source-fact evidence; it does
not become an active final-candidate stylesheet publisher in this change.

## Verification

Focused serial commands, after rebuilding compiler/Tailwind/adapter packages:

```sh
pnpm --filter @hozo/vite exec node --test --test-concurrency=1 'src/*.test.ts'
pnpm --filter @hozo/metro exec node --test --test-concurrency=1 'src/*.test.ts'
pnpm --filter @hozo/next exec node --test --test-concurrency=1 'src/*.test.ts'
pnpm --filter @hozo/tailwind exec node --test --test-concurrency=1 'src/*.test.ts'
node --test --test-concurrency=1 --test-name-pattern="generated common-plan resolver" examples/storybook-demo/scripts/caller-composition.test.mjs
node --test --test-concurrency=1 scripts/turbo-source-inputs.test.mjs
```

The browser oracle compares the actual default-session Web/Native results,
the actual generated resolver and a dynamically compiled Native owner with
real upstream Tailwind CSS under overlapping focus/hover/pressed conditions
and reversed class strings. Explicit old emission remains a negative control.
Measured locally: Vite **62/62**, Metro **90/90**, Next **21/21**, Tailwind
**138/138**; compiler **358 passed, one pre-existing skip**. Two focused browser
tests and eleven source-cache guards passed without skips. Package builds,
repository Biome (1,718 files) and generated documentation checks also passed.
Cache inputs include the raw engine files used by Metro's generated-code probe.
The initial MDX test accidentally transformed its `.hozo.css` companion into
JSX too; tightening the test producer to the actual MDX path fixed this test
error. The observation was not treated as a flake or fixed by disabling CSS
minification. Local logs are retained in
`artifacts/tailwind-order/namespace-invariance/`.

## Limits and cost

This does not broaden important, multi-rule, responsive, logical-property,
register or text-metric eligibility. It does not reorder independent JSX/
StyleX/authored-style inputs or infer absent owner facts. Existing warnings
and unassessed paths remain; a failed read-only CSS snapshot is visibly warned,
not relabeled as canonical success. Direct standalone compiler/Rust/WASM calls
and explicit pass-through contexts are unchanged.

No device parser/provider/subscription or per-state rank sorting is added.
The previously measured scalar-plan build-time and generated-resolver
cache-fill costs still apply; see [scalar planning](tailwind-static-scalar-plan.md)
and [resolver templates](tailwind-resolver-template.md). Removing Vite's second
emission is structural work reduction, not a claimed whole-app speedup or peak
memory measurement. No fresh full-app/device/AT certification or conformance
percentage is inferred from these focused integration results. CI remains
required for the complete repository verification.
