# Shared assessed priorities in the actual Tailwind write plan

Built on #1301's shared emission comparator. This connects priority facts to
the actual Web/Native compile plan, not another source inspection pass. It
does **not** enable new application winners; #1230 remains open.

## Contract

One immutable IR context lazily prepares an assessed priority table. Stable
sorting by importance and original selector specificity retains the common
Tailwind emission sequence for ties. A higher ordinal wins only for already
matched rules in the same author origin/layer/utility input tier. This is not
the complete CSS cascade, a value equivalence proof or a utility support claim.

Existing strict original-selector assessment rejects unknown shapes. Unknown
rules, ambiguous write ownership and StyleX writes do not acquire fallback
rank zero. Each actual captured write records an optional `priorityRank` and
`important` alongside its ownership evidence. Root and secondary slots share
the same fingerprint-bound keys; IDs/ranks cannot be compared across contexts.
No second module inspection parse or JavaScript priority comparator is added.

The lazy native cache is reused; validated contiguous rule IDs permit O(1)
ownership/rank lookup after preparation. The internal Node `rulePriorities()`
method returns a whole-table copy in emission order, **not priority order**,
for build-time preparation/encoding. It should not be called once per file or
state update. Mutating that JS copy cannot alter native cached facts. Ordinary
non-capturing compilation does not request this new priority table. The shared
plan remains pass-through: declaration allocation/order and emitted outputs
are unchanged. No new runtime ordering or feature switch is installed.

## Evidence

Local Windows, CPU affinity 1, Idle priority, explicit serial test execution:

- Rust workspace: **1,047 passed**, including two new priority tests. They
  exercise importance/specificity/emission precedence, lazy allocation reuse,
  unknown selectors/media and foreign/missing rule ownership. Workspace fmt
  and all-target Clippy with warnings denied passed; the addon was rebuilt
  after the final Rust edit before final JS measurements.
- Compiler: **348 passed, 1 existing Windows privilege skip**. The real addon
  host-smoke path additionally exercises the priority export.
- Tailwind: **113 passed**, including three new tests. Captured root/secondary
  Web and Native plans agree, an extra inspection parse is forbidden, and
  emitted outputs equal the pre-context control. Ambiguous duplicate custom
  utilities, unassessed group selectors and StyleX retain absent priorities.
- Native generated fixture: **5 passed**. Regeneration updates source hashes
  and adds `priority.rs` to the receipt (25 to 26 static sources), without
  changing component bodies or binding decisions.
- Raw-source cache guards: **11 passed**; both affected Turbo dry plans include
  the new helper as an input rather than trusting only its parent module hash.
- Vite: **57 passed**; explicit serial host platform-smoke selection: **61
  passed**. Lint: **1,706 files**. Docs: **76 primitives**, repository layout
  and **24 package README footers** passed.

After #1301 merged, the branch was rebased onto main
`1591043cce10663a8390c3845ddb501193603f5b` without conflicts. That main also
contains a Native border-width fix: the combined Rust workspace has **1,048
passing tests** (one added upstream). The addon was rebuilt again and the
compiler/Tailwind, fixture/cache and targeted browser checks were repeated on
that combined source. Regeneration produced no further fixture changes.

The targeted browser test is reproducible without a Storybook build:

```sh
pnpm --filter @hozo/example-storybook exec node --test --test-concurrency=1 --test-name-pattern='shared assessed rule priorities predict independent Tailwind browser winners' scripts/caller-composition.test.mjs
```

It compares actual upstream Tailwind computed background colors with the
shared native ordinal's prediction for **8 cases** (four overlapping
focus/active/hover/important combinations, each in both authored class orders).
Real pointer/focus/pressed states are asserted before reading colors; expected
colors are authored constants, not Hozo-generated CSS. This validates keys,
not production static/fallback winners or Native event delivery.

Initial runs failed before the color comparison: the test HTML lacked a
DOCTYPE. In quirks mode bare `:hover`/`:active` has a
[specified matching exception](https://quirks.spec.whatwg.org/#the-active-and-hover-quirk).
The repaired measurement explicitly asserts standards mode and retains a
negative quirks-mode control (`:hover` false but `button:hover` true). All
eight standards-mode comparisons then passed. Failed logs remain in
`artifacts/tailwind-order/write-priority`; this was a measurement error, not
an ordering defect or evidence of flakiness.

## Next and limits

Publish generated candidate/fallback metadata from the same shared priority
source, reconcile its final namespace with actual static units, and apply
the selected domain in static Web, static Native and fallback **together**.
Input tiers, authored evaluation, unknown/ambiguous writes, predicate
applicability and platform normalization remain explicit barriers. Merely
having a numeric key is not permission to cross any of them.

No full local root JS/pack/app/Metro/GPU build, fresh Native pixels/AT, new
conformance percentage, speed/heap/bundle improvement or zero-cost claim is
made. Cold preparation and any future encoded payload still need measurement
before the selected production winners are enabled.
