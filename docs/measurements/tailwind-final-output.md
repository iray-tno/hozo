# Completed batches change static and fallback scalar winners together

Built on main `66146466` after #1327/#1329 merged with their current-head checks
successful. This connects the actual scalar IR operation to the finite publisher,
not another comparison-only plan. **Ordinary adapter sessions have not switched.**

## One output capability

After its existing completeness/revision checks, `emitFinalTailwindBatch` creates
one immutable `prepareFinalTailwindContext` handle. Both actual static emitters
order the owned IR through that context before lowering. Actual candidate
generation emits the engine's schema-1 object factory call from the same handle.
There is no mutable compiler setter, app option, additional runtime parser,
provider, subscription or per-state sort. The old positional output remains
byte-identical for ordinary contexts and for maps with no assessed scalar-key
conflict.

Output identity is `scalar-order-v1:<descriptor fingerprint>`, distinct from the
ordinary pass-through context even for the same snapshot. Captured static plans,
rule-table copies and candidate results use that same qualified namespace.
Captured plans say `mode: 'scalar-order-v1'`; this identifies the selected policy,
not a claim that every write in the input was assessed/reordered. No fingerprint,
descriptor, source location or full sidecar is sent to the device factory.

Candidate eligibility now asks the **same** `scalar_write_priority` as static IR
planning, including the actual owner predicate and single-rule requirement.
Previously a uniformly ranked object could pass candidate eligibility even when
its actual predicate did not match the assessed owner. A deliberately changed
active-to-focus descriptor now proves that a rank alone cannot authorize either
path. Missing/unknown emitted objects freeze the entire class string/input to
its previous path, not partial sorting through an unknown object. Logical edges,
transforms, media/JS guards, multi-rule objects and other unassessed platform
projections have not silently acquired canonical semantics. Existing unsupported
utility diagnostics/refusals are not repaired by this policy.

The optional compact ranks are prepared once during generation and reused by
the sidecar. Runtime cache fill builds the ordered template; subsequent state
selection still does not access ranks or sort. The existing engine poison tests
remain required. Ambient direction and transform composition remain wired into
the generated object call, including when their unranked objects select legacy
behavior.

## Correctness evidence

Windows, CPU1/Idle, serial. Rust workspace **1,069 passed**, one existing explicit
ignored timing probe; all-target Clippy warnings-denied and a fresh addon after
the final Rust edit. Compiler **358 passed +one existing Windows privilege skip**,
Tailwind **130 passed**, engine **80 passed**, fixture/cache guards **16 passed**.

The final-batch integration tests consume actual retained Web/Native parses and
native scan receipts. They evaluate the actual emitted factory call, without
inserting an `ordering` object by hand. Reversed padding/width/color inputs
change both static outputs and candidate selection while ordinary contexts keep
their previous outputs. The previous cleanup/cancellation/post-Canvas tests
remain in the same suite. Wrong-owner and logical-edge barriers retain old static
outputs; real generated ambient/transform output remains executable.

The independent installed-Tailwind browser probe now also publishes two reversed
class lists as one real final batch. For each of four real hover/focus/press
states, it compares the upstream CSS with the actual emitted resolver and Native
selected styles; it separately operates the actual final Web owner. That is
**eight scenarios across all three final routes**. The same oracle still detects
the legacy padding winner. The previous common-IR probe (32 Web comparisons and
24 Native numeric selections) and eight priority-oracle cases also pass: three
focused browser tests, none skipped. Native color checks here use arbitrary hex,
not a general color-space/gamut or fresh device-pixel assertion.

An initial fixture incorrectly included `rotate-45` in the exact 90-candidate
portable snapshot; the context correctly rejected the uncollected candidate.
That mixed-generation case now uses the real project Tailwind loader in JS,
while the Rust bootstrap fixture stays within its declared universe. Initial
compile/Clippy wiring failures were fixed, not retried as flakes. Logs and all
measurement samples remain under `artifacts/tailwind-order/final-output`.

Raw source cache inputs now include the actual NAPI sources used by the final
browser boundary and the transform-composition leaf used by the Tailwind test.
The Native text fixture was regenerated normally: six source receipts changed,
not its component bodies or text ABI. No conformance denominator was changed.

## Cost and output size

The same bounded-batch probe as #1329 runs nine samples xthree batches in each of
three fresh Node25/debug processes. Parsing and JS Tailwind preparation are
excluded; native context decode, reconciliation, static emissions and candidate
generation are included. Median microseconds per batch:

| Modules / runtime candidates | Process 1 | Process 2 | Process 3 |
| --- | --- | --- | --- |
| 0 / 0 | 47.8 | 46.6 | 49.5 |
| 1 / 20 | 1,099.3 | 1,125.2 | 1,142.7 |
| 8 / 20 | 1,703.0 | 1,792.1 | 1,747.8 |
| 64 / 256 | 15,317.9 | 15,415.1 | 15,471.7 |

All samples remain, including the **18.003ms** 64/256 maximum and **1.532ms**
1/20 maximum. Separate JS preparation was **35.1–49.5ms**. The earlier
pass-through observations remain in [#1329's measurement](tailwind-final-batch.md),
not an interleaved before/after control proving an incremental regression.

At 64/256, module JSON stays **36,247 bytes**; candidate code grows from the
previous **27,722** to **31,652 bytes**, including **3,388 bytes** of compact-rank
JSON. This is raw generated code, not minified bundle/heap cost. The six-candidate
runtime fixture grows from **806 to 980 bytes**. Full descriptor data stays out.

An actual-generated-factory runtime probe rotates legacy/final order across nine
samples in each of three fresh Node processes. Cold resolution uses 2,000 distinct
strings; cached/rest and state selection use 30,000 calls. Factory evaluation is
outside timing, so this is not startup/parse cost. Median microseconds per call:

| Phase | Legacy (three processes) | Final (three processes) |
| --- | --- | --- |
| Cold string | 1.526 / 1.471 / 1.504 | 3.143 / 3.100 / 2.802 |
| Cached resting | .0107 / .0123 / .0116 | .0104 / .0120 / .0118 |
| State selection | .1650 / .1603 / .1586 | .1433 / .1475 / .1422 |

Cold allocation/sort adds about **1.3–1.6µs** in this fixture; the relative review
threshold is exceeded, not hidden. Retain the **12.54µs** legacy / **10.06µs**
final cold sample maxima and cached/state outliers too. No universal speedup,
Hermes result, startup/heap acceptance or zero-cost claim follows.

Ordinary-output controls use the saved pre-scalar-operation debug addon
(`fc45649a`, SHA256 `bec34e5a485ff5fd7bef9934b5fa0ed8e04ea6ea101231a370cdef7913b9ff5b`).
Three before/after process pairs, alternating order, cover three modules on both
backends, with/without a pass-through project context. Nine x200 calls per case;
**all 36 output hashes match**. Median differences range **-4.2% to +4.5%** plain,
**-2.9% to +5.2%** with context. The positive 5.2% observation is retained, not
called zero overhead. This older binary also predates unrelated main changes;
these bounded controls do not isolate every contribution to time or certify
project-wide performance.

## Still open

Authoritative final adapter graphs, worker/cached-transform lifecycle and final
Web candidate CSS must connect to this completed output boundary before default
graduation. This is not a whole-project transaction or proof of theme/value
equivalence. Important drawing, broader properties/predicates and cumulative
production build/runtime cost remain #1230 work. No full local root/pack/app/
Metro/GPU workload, fresh Native pixels/AT/Hermes, production bundle, heap or
new conformance percentage is certified by this layer.
