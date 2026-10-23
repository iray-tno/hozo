# Canonical Tailwind order: reference before implementation

Tracking #1230; design [RFC 007](../rfcs/007-canonical-tailwind-order.md).
The before source is main `99e9c03a61aaa80c86893fbea72c25df431f86ce`, not #1237.
No production ordering changes are introduced by this reference layer.

## Preparation boundary

The next opt-in build-tool service, `prepareTailwindOrder` in `@hozo/tailwind`,
retains original per-rule signatures and nested structure before any Hozo
longhand expansion. Its immutable snapshot has context-local candidate/rule
IDs, first-rule ranks explicitly separated from per-rule data, and a receipt
covering Tailwind version, schema/policy, all stylesheet content and candidate
universe. The read-only loader is reused without an entry-only persistent cache.
Uncollected candidates require a new preparation; non-generated tokens remain
explicit. Independent pinned reference descriptors check the complete corpus.

Preparation is async; consumption is synchronous. No adapters or compiler
emission paths call this service yet. This establishes the snapshot/lookup
contract, not the unresolved project collect/prepare/emit integration, Rust IR
unit identity, portable facts or shared comparator. It changes no winners,
candidate refusals, runtime subscriptions or runtime payloads.

For isolated CPU-1/Idle preparation measurements, run:

```sh
node scripts/tailwind-order-context-cost.mjs > artifacts/tailwind-order/context-cost.json
```

This opt-in probe keeps all seven fresh-design-system samples at 1/16/128/1024
padding candidates, first preparation separately, source/theme fingerprints
and JSON/gzip snapshot sizes. It is not a clock gate, a cold-Node benchmark,
an app payload/IR-memory result or evidence of enabled-path zero overhead.
The verbose snapshot is build-only; choosing a compact compiler/runtime
encoding and measuring the enabled paths are still required before rollout.

An initial Windows x64 / Node 25.9.0 / Tailwind 4.3.3 capture, serial on CPU 1
at Idle, recorded medians of 48.50/15.02/23.83/126.17 ms for 1/16/128/1024
candidates. First preparation was 81.55 ms after module imports. Samples were
noisy: the 128-candidate maximum was 1691.60 ms and is retained, not discarded.
These are isolated preparation observations, not compiler before/after results.
Build-only snapshot JSON/gzip bytes were 694/445, 5187/714, 39293/2688 and
316303/18566 respectively (absolute stylesheet paths affect these sizes).
Raw evidence is `artifacts/tailwind-order/context-cost.json`, with source and
theme hashes. No payload or performance budget is graduated from this one run.
A final-source repeat (`context-cost-final.json`, including the defensive
candidate-array capture) recorded 30.47/6.18/6.68/16.85 ms medians, 99.81 ms
first preparation and identical byte sizes. Both captures are retained; the
host spread is not a speedup claim. The large JSON representation is deliberately
not the eventual compact IR/runtime ABI.

## Reviewed reference

`packages/tailwind-conformance/src/tailwind-order-corpus.ts` is a small,
versioned adversarial workload, not a coverage denominator. Fifteen browser
cases cover numeric ties, shorthand/axis/side spacing, width, radius, colors,
font size/leading/slash/weight and overlapping hover/active. Reversed strings
and LTR/RTL give 60 independent expected-value comparisons. They exercise the
real Tailwind stylesheet, not a sort written for this test.

Additional descriptor-only probes include alpha modifiers, prop/ARIA/data,
responsive/dark, logical sides and a placeholder selector. These are not new
Hozo support claims. A CSS-only repeated custom utility deliberately produces
two separate rules, so a first-rule class rank cannot masquerade as all of its
rule metadata. No project JS/plugin is loaded for this controlled probe.

The checked-in generated fixture pins Tailwind 4.3.3, theme/corpus hashes,
class-first-rule order and each rule's original property signature, count and
selector/at-rule structure. It is test evidence, not production ordering data.
The compact generated JSON has a narrow formatting exclusion; its exact bytes
are independently regenerated and asserted by the conformance test.

```sh
node scripts/tailwind-order-reference.mjs --check
node --test --test-concurrency=1 packages/tailwind-conformance/src/tailwind-order-reference.test.ts
node --test --test-concurrency=1 --test-name-pattern='canonical-order reference' examples/storybook-demo/scripts/caller-composition.test.mjs
```

To deliberately change the corpus/reference, regenerate without `--check`,
review the fixture and browser expectations, and record the reason. A Tailwind
upgrade must update the explicit version as well. A missing browser fails in
CI; a local skip is not successful browser evidence.

## Next evidence, deliberately separate

Measure actual current Hozo output against this reference without pretending
known divergences pass. Record static Web, selected Native styles and generated
candidate routes separately. Keep compiler/cold-resolution/cache/state costs
and generated payload size separate from browser correctness. Timings are
descriptive repeated samples, not flaky PR clock thresholds. No baseline in
this first layer measures application bundles, Native pixels/AT or IR memory.

## Differential capture and cost tooling

The next layer adds `tailwind-order-baseline.ts` and
`scripts/tailwind-order-cost.mjs`. Neither is shipped compiler/runtime code.
The browser characterization records every case/order/direction under five
routes, including diagnostics and raw selected Native values. Its report
retains partial captures on a browser failure and marks them invalid. CI
uploads `tailwind-order-baseline`; passing the capture test does **not** mean
the observed Hozo output conforms.

Initial main-based observations (60 cells per route):

| Route | Matched | Mismatched |
| --- | ---: | ---: |
| Static Web | 32 | 28 |
| Default candidate CSS | 36 | 24 |
| Project-ordered candidate CSS | 56 | 4 |
| Selected Native styles | 32 | 28 |
| Native candidates | 30 | 30 |

This deliberately adversarial corpus is not an overall coverage percentage.
For example the project-ordered sheet still loses the font size of `text-lg/6`
in this probe: sorting alone is not all utility support. The Native comparison
is an explicit direction/default scalar projection, not a device rendering;
the report keeps raw data so its assumptions can be inspected. No existing
conformance snapshot is changed by recording these disagreements.

```sh
node --test --test-concurrency=1 --test-name-pattern='canonical-order baseline records' examples/storybook-demo/scripts/caller-composition.test.mjs
node scripts/tailwind-order-cost.mjs --samples 7 --iterations 25 --profile debug --output artifacts/tailwind-order/before.json
# Repeat after the implementation, keeping harness/corpus/toolchain/profile identical:
node scripts/tailwind-order-cost.mjs --samples 7 --iterations 25 --profile debug --baseline artifacts/tailwind-order/before.json --output artifacts/tailwind-order/after.json
```

The cost CLI rebuilds the addon **before using it**, serially, at the selected
debug/release profile. It records actual binary hash, production source hash,
Git revision/dirty state, toolchain and harness identity. A comparator rejects
incompatible contexts/profiles or missing CLI rebuild receipts. It never
overwrites its baseline file. Default clocks are opt-in, not a new timed PR
gate; synthetic comparator unit data is not a real rebuild receipt.

Every compile sample sweeps all 30 source/order fixtures. Cold candidate
samples use unique strings with a fresh resolver outside the lookup clock;
small maps have fewer possible unique pairs, and operation counts are explicit.
Cached/state samples reuse a warmed string, with at least 100,000 operations
per sample. First reference preparation and first compiler construction are
kept separate from warmed repeated samples. Report all samples plus median/p90,
not a best successful run. Fresh design contexts in a warmed process are not
a claim of cold Node startup or project discovery.

Local A/A captures used CPU 1, Idle, serial, Windows x64, Node 25.9.0, Rust
1.96.0, debug profile, 3 samples and 20 corpus sweeps (600 compiles/sample).
Production sources were unchanged from `99e9c03a`. Synthetic bundled candidate
consumers, including the actual resolver and table, were byte-identical:

| Candidates (including two state candidates) | Minified bytes | Gzip bytes |
| ---: | ---: | ---: |
| 18 | 2,862 | 1,167 |
| 130 | 11,259 | 2,608 |
| 1,026 | 82,464 | 14,567 |

These are synthetic candidate consumers, not production app bundles; no React
or application graph is included. A/A timing changes are runner/JIT noise, not
speedups. Parse/planning/lowering attribution, IR allocations/peak memory,
incremental project work, state rank-read instrumentation and real app payloads
remain explicitly unassessed. This is the before harness for the common plan,
not evidence that the proposed replacement has zero overhead.
