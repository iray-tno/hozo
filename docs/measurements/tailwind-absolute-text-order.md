# Absolute text metrics in the common Tailwind plan

## Scope and the old path removed

The current project policy is `scalar-order-v4`. Existing absolute font-size,
line-height (explicit and font-size fallback) and absolute letter-spacing
writes now use the same original-rule ownership/rank checks as other assessed
writes. Tailwind remains the only utility order source. No text-specific
utility ranking table is introduced.

One redundant old operation is bypassed: `group_by_condition` no longer applies
its legacy condition-specificity sort to an entirely canonical **single**
authored input. The common plan has already ordered that input. Mixed inputs
still use ADR011's specificity/JSX composition; unassessed inputs keep their
old route. The change does not remove those distinct contracts.
Unconditional semantic defaults do not turn that single authored input into
a mixed frontend. Unknown guarded declarations do retain the old route.

## Why a font-size is not just one scalar

Tailwind's font-size utility carries a fallback line height. Its CSS reads
`--tw-leading`, so any applicable explicit leading survives a later font-size
rule, even a more-specific conjunction. Treating the fallback as an ordinary
RN number incorrectly erases that register behavior.

After authored input precedence has been determined, the static Native
adapter projects fallback line-height slots before explicit absolute leading,
retaining their guards and the established order of every non-fallback write.
The register can come from another frontend input too; an unrelated StyleX
color or a semantic Strong default must not undo this platform projection.
Repeated guarded objects get distinct names even without a second source
input. The usual unconditional/state and caller tiers remain separate.

Generated Native maps mark actual default-bearing objects, never class names
or private RN style keys. They prepare default-free copies once at factory
initialization. The existing resolver composition hook selects those copies
when an explicit leading is active; it restores defaults when the state turns
off. Cache hits do not sort/read ranks; state changes do not clone style
objects, evaluate CSS or subscribe to anything. State selection/composition
still costs work, measured separately rather than described as free.
Transform metadata/composition continues to work alongside this projection.

## Evidence

The independent browser probe compares Tailwind-generated CSS and compiled Web
CSS against actual Native label props and an executed generated resolver.
Five class lists, both authored orders, two browser owners and eight pointer/
focus setup combinations produce 160 observations. Assertions use the actual
browser state, since pointer-down can itself focus an owner; those are not 160
distinct states. Package tests separately enumerate all eight boolean owner
states, verify root/secondary/nested owners and explicit style precedence,
and retain transform coexistence and relative-metric barriers.

Serial local results: Rust workspace **1,076 passed**, one existing intentional
cost probe ignored; Tailwind **150**, compiler **358** plus one existing skip,
engine **84**, Metro **93**, Vite **62**, Next **21**, the full browser
composition suite **35**, Native-fixture/cache guards **16** passed. Workspace
Clippy with all targets and warnings denied, rustfmt, generated ABI (56 leaves,
78 names), generated docs and four package typechecks passed. A fresh addon
was built after the final Rust edit. These are not full root/packing results.

Engine tests verify immutable shared style objects, reuse of prepared
projections, restoration when states deactivate, unchanged ordinary-array
identity and zero subsequent rank reads after the initial cached template.
An IR regression ensures canonical projection order is not independently
reweighted, while a different authored input still uses ADR011 specificity.

Run serially after a fresh addon:

```sh
cargo test --workspace
pnpm --filter @hozo/compiler build:native
pnpm --filter @hozo/compiler build
pnpm --filter @hozo/engine build
pnpm --filter @hozo/tailwind build
pnpm --filter @hozo/tailwind exec node --test --test-concurrency=1 'src/*.test.ts'
pnpm --filter @hozo/engine exec node --test --test-concurrency=1 'src/*.test.ts'
node --test --test-concurrency=1 --test-name-pattern='absolute text metrics preserve' examples/storybook-demo/scripts/caller-composition.test.mjs
```

Logs, including initial failures, live under
`artifacts/tailwind-order/namespace-invariance/metric-*`. The first probes
incorrectly evaluated JSX as plain JS and asked a bare Text for Pressable
state. Corrected probes found two real projection defects: duplicate guarded
style names and the redundant legacy condition sort undoing register
projection. A no-leading byte-identity test also caught unnecessary movement
of defaults; the projection now requires an explicit absolute leading. These
were not treated as flakes or hidden by retrying CI.

The full browser run also exposed missing real-helper injection in the
import-stripped VM harness and a stale behaviors build after syncing main
(`useDrag1D` was present in source but absent from its old dist). The harness
now supplies the actual generated helper, and dependent package output was
rebuilt. No production behavior was weakened to satisfy those harness errors.
The mixed-input probe also corrected two fixture assumptions: inherited
HozoText supplies a style callback rather than a Pressable render child, and
StyleX numeric line-height is a multiplier, not pixels. The absolute fixture
now writes explicit `px` strings using the accepted static API.

Native source receipts are regenerated normally; this is not a fresh device
run. Full root/packed-consumer/application integration and reports belong to
CI. No new Native pixels/AT result or overall conformance percentage follows
from selected-style/browser comparisons.

## Composition cost and emitted payload

A controlled ablation removes only metric composition from the same generated
module; it is not a previous-release compiler baseline and the ablated route
is not semantically correct for conflicting leading. CPU1/Idle, Node25/debug
addon, three fresh processes, nine alternating samples each at 18/130/1,026
candidates. Each sample resolves 256 new strings, then 10,000 state calls and
10,000 ordinary cached calls separately. The all-candidate emitted factory,
real resolver and data are bundled/minified/gzipped together.
The three font-bearing candidates are held constant while spacing candidates
grow the table; this does not measure a project containing 1,026 text variants
or establish a peak-memory bound.

Observed module deltas were **+251 minified bytes**, **+115/+120/+155 gzip
bytes** at those sizes. In the first three captures, 256-string cold medians
were about 0.50–0.66ms without composition vs 0.69–1.02ms with it. State-call
medians usually increased by roughly 1–3.4ms per 10,000 calls; one noisy 1,026
candidate control was slower than composition. Ordinary cached calls remained
about 0.09–0.16ms per 10,000 calls, with no extra composition on those hits.

The relative cold/state delta exceeds 5% in this intentionally tiny workload;
the absolute added cost is microseconds per cold string and fractions of a
microsecond per state call, not a whole-app speed claim. All samples/outliers
remain in the artifacts. Hash-bearing final-source captures are retained
separately from these initial observations. Projects without both an emitted
font-default and an explicit-leading candidate do not install the helper or
metadata; a refused responsive leading does not trigger them.

Reproduce the manual, non-gating ablation after the same fresh builds:

```sh
node packages/tailwind-conformance/scripts/measure-text-metric-composition.mjs
```

Its JSON preserves each sample, source/addon/output hashes, context identity
and dirty-checkout status. Keep independent process captures rather than
selecting the best sample. It does not run automatically in ordinary tests.

## Deliberate remaining boundary

This does not newly parse slash font-size modifiers or custom text-size theme
values, nor enable ratio leading or `em` letter-spacing in the canonical plan.
Their existing static folding/refusals remain intact; a relative write is
still a whole-input ordering barrier. Register-dependent recomputation,
logical/gap aliases, transforms, other properties, broader conditions and
standalone default ordering remain open. None are silently reclassified as
unsupported simply to graduate this slice.
In particular, this owner-state/absolute evidence is not a completion claim
for responsive/dark or other cross-tier register combinations.
