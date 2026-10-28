# Negated ARIA ordering and dynamic owner facts

Continues #1230 above #1364. This is a bounded condition expansion, not the
completion of the six-group migration.

## Contract

The captured Tailwind 4.3.3 rule shape `&:not(*[aria-…="true"])` supplies
negative owner predicates for busy, checked, expanded, selected, invalid and
disabled. Their positive and negative atom multiplicities are distinct.
Original rule specificity/emission order still supplies priority; no utility
name order, colon counting, arbitrary selector parsing or De Morgan rewriting
is introduced. False/mixed/presence/flagged/relational/unknown selectors and
other negations remain unassessed barriers. Mixed source tiers retain ADR 011.
Policy **scalar-order-v8** invalidates v7 output and hashed Metro transfers.

The first actual-plan probe found that dynamic candidates refused all negated
ARIA conditions, although static lowering already supported them. Widening
only static eligibility would have preserved a real disagreement. Candidate
generation now carries compiler-owned `!aria-…` predicates; the resolver
prepares underlying keys/expected boolean values once. Positive-only maps
allocate no negative side table. Existing owner state keys are unchanged.
There are no new providers, subscriptions or state-update rank/selector parses.
Legacy and ordered maps now share one missing-fact matcher instead of two
implementations. Missing facts warn once per candidate and never become true
by negation. Authored readable optional state evaluating to null/undefined is
different: that is a known absent attribute, so the literal true predicate is
false and its negation can match. `checked="mixed"` and invalid="grammar" are
also not literal true. Ambient decisions retain this distinction.

## Verification

Final verification is serial, CPU 1/Idle, with a fresh addon after final Rust
changes. Workspace Rust: **1,081 passed / one intentional ignored**, fmt and
all-target Clippy warnings denied. Engine **87**, compiler **360 / one existing
skip**, Tailwind **156**, Metro **93**, Native host/receipt/cache **146** and
complete browser composition **37** tests passed. One extra host test belongs
to the intervening main Drawer change, not this expansion.

New Native comparison: **1,024 observations** across both class orders,
static/dynamic output, six independent ARIA bits, explicit disabled and hover;
additional optional/null/mixed cases also pass. An unreadable Native driver
remains a diagnostic, not an unconditional style. Engine tests cover ordinary
and ordered maps, missing/forged facts, warning deduplication, ambient facts,
cached object identity and no hot-path key parsing/rank reads.

The browser oracle retains the original **256 positive observations** and
adds **268 negative reference/compiled observations**. It uses actual upstream
CSS, actual compiled Web button props, static Native output and the actual
compiled opaque-class callback, not hand-supplied dynamic semantic facts.
Both class orders, null/undefined state, mixed checked and non-true invalid
are covered. Legacy output is a required mismatching control.

An initial optional-state comparison failed (36px generated versus 48px in
the reference) because the probe omitted fact keys that the actual compiler
does supply for an authored optional state prop. Executing the real dynamic
callback corrected the measurement. The earlier refusal discovery and this
failure remain in `artifacts/tailwind-order/namespace-invariance/negated-aria-*`;
neither is called flaky. The first ad-hoc browser probe lacked the affinity
prefix; the corrected focused and complete verification use CPU 1/Idle.

Generated ABI/source receipts, raw-source cache inputs and remaining integration
checks also passed: ABI **57 leaves / 79 names**, metadata, normal Native
receipt generation/freshness, Vite **62**, Next **21**, focused conformance
components **43**, four affected package typechecks, lint **1,746 files** and
generated docs. Turbo dry-run verifies the raw-source probe inputs.
A regenerated source receipt is not a fresh
device run. No new conformance percentage, full root/local app build, AT/device
equivalence or whole-app performance result is claimed.

## Isolated positive-path cost

Reproduce with `node packages/engine/scripts/measure-negative-facts.mjs
--baseline=<prior-resolver-git-ref>` (one shell line). The recorded baseline
is `b94be27006af5c945bddf0f940e84e4ac651e481`. The script compares isolated
resolver implementations in the same process, checks equal positive-path
output, warms them, alternates nine sample pairs and retains every sample.
Factories (100/sample) and cached calls (100,000/sample) are separate.

Minified resolver module: **2,948 -> 3,125 bytes**, gzip **1,421 -> 1,542**
(+177 / +121). This is not a whole-app/Metro bundle result. With 16 and 256
positive state classes, median cached calls are **0.329 -> 0.336 us** and
**0.332 -> 0.358 us**, respectively. The latter is over 5% relatively but only
about **0.025 us/call** in this isolated run. Factory medians are **0.440 ->
1.376 us** and **0.429 -> 13.111 us**: the one-time state-table scan is visible,
not free. No-state cached-call medians vary 0.055 -> 0.023 us; this is not
claimed as a speedup. This small single-process probe establishes neither
device timing nor peak memory. It compares equivalent positive fixtures,
not a falsely equivalent baseline for the newly supported negative feature.
