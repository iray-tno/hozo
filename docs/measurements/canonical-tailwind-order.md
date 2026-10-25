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
contract, not the unresolved project collect/prepare/emit integration,
portable facts or shared comparator. It changes no winners,
candidate refusals, runtime subscriptions or runtime payloads.

## Initial binding of prepared facts to retained utilities (#1249)

The next compiler-only slice consumes that snapshot in `hozo_ir` as an
immutable `TailwindOrderContext`. It validates schema/policy, provenance
format, unique contiguous identities, candidate/rule ownership, status and
ordered property signatures. It retains the complete rule list, nesting,
importance and arbitrary-width decimal variant bitset. The loader fingerprint
is a namespace receipt, not authentication of a caller-created JSON object.
No context cache trusts that string as a substitute for receiving the data.

`context.bind(root.tailwind_units)` borrows descriptors once for the module's
retained utility table; every root/secondary slot shares the same IDs. Lookup
by utility ID thereafter is indexed. It does not copy strings, signatures or
rule trees per declaration. A multi-rule candidate stays a multi-rule
candidate: this layer does **not** guess which expanded Hozo write belongs to
which upstream rule, or claim custom utility support because its name binds.
The public Rust declaration/root layout is unchanged by this binding layer.

The internal Node inspection methods `setTailwindOrder(JSON.stringify(snapshot))`
and `inspectTailwindOrder(source)` exercise the real parser with its configured
helper and StyleX registry. Report statuses distinguish `described`,
`not-generated`, `uncollected` and `no-context`. Inspection inventories only
parser-retained utilities, not all lexical strings or unresolved dynamic
candidates. Syntax recovery is reported separately. Invalid replacement
preserves the old context; clearing removes it. Full per-rule facts live in
the shared Rust model, not a second JavaScript ordering engine.

This inspection parse is evidence tooling, **not** an adapter hook to run
before compilation. The eventual planner must bind the transform's existing
parse once, collect any newly resolved candidates before preparation and
provide portable descriptors for the standalone path. No emitter, project
adapter or device resolver consumes the context in this slice. Existing
priority differences remain; #1230 stays open.

Local checks on Windows x64, CPU 1 / Idle / serial: Rust workspace 1,023 passed;
Tailwind suites 50 passed; compiler suites 338 passed with 1 existing Windows
symlink skip; Native Showcase 220 passed with 1 existing skip. The real-loader
binding tests cover multiple upstream rules for a builtin name, secondary
slots, nested/multiple roots, source constants, authored guards, helper
configuration, unknown facts, replacement/clearing, malformed descriptors and
UTF-16 syntax diagnostics. Setting and clearing context leaves actual Web and
Native compile results unchanged. The saved 30-case corpus, six additional
root/slot/mixed/nested fixtures and generated Native candidate module are also
byte-identical. These are compiler/style facts, not fresh device pixels/AT.

```sh
node scripts/tailwind-order-binding-cost.mjs > artifacts/tailwind-order/binding-cost.json
```

This opt-in command rebuilds the addon before loading it. Seven same-process
samples, 20 replacements/sample, debug Rust, Node 25.9.0: median time **per
replacement**, including JSON decode, validation, indexing and destruction of
the previous context, but excluding upstream preparation/input serialization:

| Prepared candidates | Snapshot JSON bytes | Replacement ms |
| ---: | ---: | ---: |
| 16 | 5,187 | 0.132 |
| 128 | 39,293 | 0.982 |
| 1,024 | 316,303 | 7.904 |

These are build-time input bytes, not a new application/runtime payload.
Inspection of the same 16 retained utilities was about 0.12–0.13 ms per call
with/without context, but includes parsing and result transport; it is not an
isolated binding benchmark or evidence that the future planner is free.

A separate five-sample, 20-corpus-sweep capture using the unchanged cost
harness/profile against the saved #1244 control observed ordinary Web +0.33%
and Native +0.09% median compilation time. Candidate consumers stayed exactly
2,862/1,167, 11,259/2,608 and 82,464/14,567 minified/gzip bytes. These descriptive
samples do not establish zero overhead, a speedup, app startup, peak memory or
the eventual enabled planner's cost. The initial comparison request with
three samples was rejected for incompatibility with the five-sample baseline;
its log was retained and the baseline was not overwritten. Full raw evidence
is in `artifacts/tailwind-order/binding-*` locally. No timing gate was loosened.

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

## Rust candidate identity, before changing winners

The parser now interns original compiled candidate names before utility
expansion, on literal, decomposed-expression and secondary-slot paths. Each
expanded declaration carries an inline `TailwindUtilityId`. All module roots
share one immutable `TailwindUnits` table; cloning/detaching a **root** keeps
its nested and slot IDs resolvable after the parsed module is dropped. A bare
detached `Node` must be kept with its root's table when inspecting IDs. IDs
from separate tables must not be mixed. No Arc/string is added per declaration.

The new source variant retains the existing JSX input offset. `input()`
explicitly excludes utility identity when existing grouping/interaction/Native
style naming asks about that boundary. Otherwise two utilities in one input
would accidentally become two inputs. StyleX and synthetic declarations keep
their established provenance. Unknown carried classes create no units.

This is **candidate identity**, not a claim that Hozo's expanded groups match
Tailwind's original rule IDs. For example `container` retains one candidate
across all its condition groups without inventing an upstream rule-zero
binding. Prepared project/portable descriptor binding and the shared plan are
still pending. Existing text adaptation copies the source; inherited frames
do not acquire a parent's cascade weight. Forwarded external-summary styles
without an originating unit remain explicitly unbound.

Measured on Windows x64, Node 25.9.0, Rust 1.96.0, debug addon, CPU 1/Idle,
serial, against main `66abd639618d0fa1c8e99fa4e294bc8e2b3d86f9`:

- Rust workspace tests, repeated addon rebuilds and 30 corpus subjects plus
  six root/secondary/mixed/nested fixtures checked byte-identical Web/Native
  output and candidate module. No conformance disagreements are removed here.
- A first complete clean capture exceeded the review threshold on Web
  (+5.12%; Native +1.82%). Small one-class cases also showed 5–7% increases.
  That representation was not submitted unchanged: zero/one-unique-candidate
  contexts now avoid creating a hash table, including its RandomState.
- With that fast path, five 600-call corpus samples gave medians
  **68.73 -> 69.23 ms Web (+0.73%)**, **84.90 -> 82.52 ms Native (-2.80%)**.
  Seven 1000-call samples per plain/padding/color/text/several-class case
  showed no >5% median increase in the optimized capture; the several-class
  case was +2.21% Web / +2.06% Native. All earlier captures remain retained.
  This is not a speedup or zero-overhead claim, or a representative app build.
- The layout probe's equivalent prior/current field representations measured
  `StyleSource` 8 -> 12 bytes and `StyleDeclaration` 192 -> 200 bytes; each
  root adds one 8-byte optional context pointer. The ID itself is 4 bytes.
  Unique candidate names/table storage are additional build-time allocations;
  this is not a peak-memory/allocation-count measurement.
- Full resolver+candidate-table synthetic bundles remained byte-identical:
  2862/1167, 11259/2608 and 82464/14567 bytes minified/gzip at 18/130/1026
  candidates. Neither this table of names nor source IDs are emitted to device
  code. Production app bundles and Native pixels/AT were not remeasured.

Reproduce the corpus timings using `scripts/tailwind-order-cost.mjs` on each
revision, rebuilding each addon's source, with `--samples 5 --iterations 20`
and separate `--output` files, then `--baseline` for comparison. Raw receipts:
`unit-before-repeat.json` / `unit-optimized.json`; small-case corroboration:
`unit-small-before.json` / `unit-small-optimized.json`, with its harness hash.
All are under `artifacts/tailwind-order/`. Provisional pre-commit captures
are retained but not used as final source-complete receipts.
A clean-head final repeat (`unit-final.json`, `69a855dd`) gave Web
68.69 ms (-0.05%) and Native 83.59 ms (-1.54%) against the same rebuilt
control. Its source/binary hashes and all samples are retained separately.

Rust IR consumers constructing a parser `Root` must supply `tailwind_units`
(`None` for manually built trees with no utility IDs). Code comparing a
`StyleSource` for its frontend/input boundary must compare `input()`, not full
utility identity. Existing `Tailwind(input)`/`Stylex(input)` constructors remain
available. These are pre-release compiler IR changes, not a generated device
ABI change.

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

## Shared pass-through plan in actual compilation

The next slice connects that context to `compile`, `compileNative` and
`compileNativeModule` in the Node compiler. The parser's
`plan_module_tailwind(&mut ParseOutput, context, capture)` consumes the existing
IR after Native forwarding and before platform lowering. It takes no source
text and runs no parser. The common `hozo_ir::TailwindWritePlan` owns each
existing style vector and returns that same allocation to the IR consumed by
the lowerer. It does not reconstruct or evaluate author expressions.

Root and owned-root class slots, secondary slots, carried child/prop nodes and
forwarded declarations go through the same traversal. Blocks keep contiguous
input/utility/predicate boundaries; repeated blocks do not merge backwards.
Rule descriptors bind once to the module table. No new fields are added to
`Node` or `StyleDeclaration`. The Node compiler's output-result types do gain
an optional build-time evidence field; this is not a zero-memory-cost claim.

Prepared compilation without evidence produces the exact same complete
results as unprepared compilation in the regression tests. A per-call internal
`tailwindPlan: true` requests a report from that actual compile, not the
separate inspection parser. Only this capture path constructs report strings,
rule-ID lists and site/block records; they never enter JSX/CSS/StyleSheet
output. Sites describe IR style collections, not final DOM element counts:
for example a Pressable can have a separate owned root `className` slot.
`Unspecified` provenance is reported as `unspecified`, not invented evidence
that a write is a synthetic default. Missing identity stays unassessed.

The internal NAPI Native-module call now receives one named options object
for RFC 006 choices and evidence rather than another positional boolean. The
TypeScript entry keeps the existing call shape, with optional evidence added.
Raw addon overrides must match this source and be rebuilt. Standalone
Rust/WASM calls still lack a prepared/portable context; no adapter is enabled
and the candidate resolver is unchanged. This is pass-through integration,
not the completed common comparator or a compatibility-coverage increase.

Local CPU-1/Idle/serial verification: Rust 1,025 passed; compiler suites 338
passed plus 1 existing skip; Tailwind suites 53 passed; Native Showcase 223
passed plus 1 existing skip; source-input guards 9 passed. Rust tests compare
every node/capture and style-vector pointer/capacity before and after planning,
with capture both off and on. Actual compile tests check identical emitted
results, shared Web/Native evidence, contiguous complete write ranges, UTF-16
spans, nested/secondary/owned slots, forwarding, StyleX boundaries and unchanged
text-static ABI choices. The stored 30-subject output corpus, six additional
fixtures and Native candidate module remain byte-identical. The regenerated
device fixture changes receipts only, not its generated test bodies.

The updated binding-cost command measures ordinary prepared compilation and
evidence capture separately. Seven warmed samples, 20 compiles/sample, debug
addon; each module uses the same 16 padding utilities while the prepared
universe grows:

| Prepared candidates | Prepared vs no-context Web median | Native median |
| ---: | ---: | ---: |
| 16 | +2.05% | +0.44% |
| 128 | +2.57% | +1.18% |
| 1,024 | +3.18% | +2.65% |

Capture costs more and is not hidden inside those numbers: Web evidence
medians were 4.62–4.95 ms per 20 calls vs 3.56–3.65 ms without capture; Native
7.84–8.14 ms vs 6.74–7.00 ms. These are synthetic build-time measurements,
not application/device timings or the cost of an enabled ordering comparator.

An ordinary-corpus comparison against the older saved #1249 sample initially
showed Web +6.04%, Native +4.03%. That observation was retained and investigated,
not accepted as noise without a control. Fresh clean parent (`da260b00`) and
implementation (`7e563b13`) addons rebuilt in the same worktree/profile gave
five-sample medians of 70.1349 -> 70.0202 ms Web (-0.16%) and 83.4297 -> 84.4886 ms
Native (+1.27%), each per 600 compiles. Both observations remain in the local
`plan-ordinary-cost` / `plan-clean-parent` / `plan-clean-after` reports. This
does not prove zero overhead or a speedup. Candidate consumers stayed exactly
2,862/1,167, 11,259/2,608 and 82,464/14,567 minified/gzip bytes. The measured
implementation checkpoint precedes the final evidence-only `unspecified`
label correction and documentation; it is recorded, not mislabeled as final
head. Peak memory, application bundles and fresh device pixels/AT are not
measured. Full source/profile/harness/sample receipts stay in the reports.

## Per-rule ownership and a portable bootstrap

The next layer uses the same prepared rule shapes to assess a bounded owner
scope, then associates each retained IR write with an original CSS declaration.
The root must be exactly the escaped candidate class. Assessed nested selectors
are single `&:hover`, `&:focus`, `&:focus-visible`, `&:active` and `&:disabled`
wrappers, including chains; `(hover: hover)` is the only assessed media wrapper.
Their specificity comes from the original selector, not IR guard counts. An
authored JS guard adds no CSS specificity. Selector lists/functions, relations,
pseudo-elements, other at-rules, branching scopes, empty bodies and mixed
importance remain explicitly unassessed; unknown is not `[0, 1, 0]`.

Write ownership currently covers spacing/gaps, foreground/background colors
and dimensions. This is a mapping to the **original** CSS property, not a
property-order table or Native normalization. For example expanded left/right
writes can belong to `padding-inline`; this does not prove Yoga resolves
logical/physical conflicts like CSS. All rules are inspected: a write must
have one matching original declaration, not an assumed first-rule owner.
Repeated owners are ambiguous, and an unassessed sibling rule blocks a claim
of unique ownership. Typography/default registers remain unmapped.

These facts are available in the actual compile's explicit `tailwindPlan`
evidence as indexed writes, rule IDs, original property, specificity or an
unknown reason. Ordinary compilation does not run assessment or allocate the
new per-write report. This is **not** value or condition equivalence, whole
candidate support, a new cascade winner, or permission to sort. In particular
a project utility can add a CSS write absent from Hozo's parsed IR; uniquely
identifying a retained write does not certify the entire custom utility.

`node scripts/generate-tailwind-order.mjs` generates
`crates/hozo_ir/src/tailwind_portable.rs`; `--check` reproduces it. It reuses the
canonical descriptor extractor and pinned Tailwind 4.3.3 builtin theme, not a
hand-kept property/variant rank list. The bootstrap has **90 exact candidates**,
89 rules and one explicit not-generated entry. It includes negative/compound
probes, not just assessed positives. Unknown `p-3` is uncollected even though
`p-2` and `p-4` exist: no sample-to-family interpolation is implemented.

`portable_tailwind_snapshot()` constructs the existing validated Rust context
format on explicit request. It has a builtin theme receipt and its own complete
universe fingerprint, not project-relative ranks mixed with builtin ranks.
Rust tests feed it to the shared parser plan without Node callbacks, a second
parse or JSON parsing. Default standalone/WASM exports and build adapters are
**not** automatically enabled. Broader/parametric portable extraction, actual
WASM artifact measurements and collect/prepare/emit integration remain open.
This finite bootstrap is not claimed as the complete portable context.

Local CPU-1/Idle/serial checks: Rust 1,031 passed; Tailwind 56 passed; compiler
338 passed plus one existing Windows symlink skip; Native Showcase 223 passed
plus one existing skip; cache guards 9 passed. Rust fixtures cover the rule
scopes, ambiguous/multi-rule ownership, importance, original longhands and
unmapped typography. Actual Node compiles verify all indexed writes, identical
Web/Native reports, JS guards, secondary/nested slots, unknown/uncollected
facts and multi-rule project additions. Full emitted results remain identical
with the prepared context, including ordinary calls without report capture.
The saved 30-subject corpus, six additional fixtures and Native candidate module
remain byte-identical. The device fixture changes source receipts only; its
proof/body/route choices do not change. An initial compiler-suite invocation
from the repository root failed its cwd-dependent resolution fixture; running
from the compiler package gave the results above without changing that test.
Both logs are retained. No new browser/device pixels/AT or full conformance
percentage is claimed.

Fresh paired debug builds of parent `8a45d89f` and implementation checkpoint
`10ee5f5d`, in this same worktree, recorded five samples per 600 ordinary calls:
Web 72.8920 -> 74.7790 ms (+2.59%), Native 91.2599 -> 90.7074 ms (-0.61%).
The checkpoint contains the measured implementation and precedes only this
documentation. No speedup/zero-overhead claim is made. The existing synthetic
candidate consumers are still exactly 2,862/1,167, 11,259/2,608 and
82,464/14,567 bytes minified/gzip; their resolver/data were not changed.
Unchanged preparation/cache/state tasks also vary in the raw receipts (for
example reference preparation +15.25%, 130-candidate cold lookup -40.94%);
these are not attributed to this implementation or reported as improvements.

The separate prepared/capture probe retains seven samples per 20 compiles,
each using 16 padding utilities regardless of prepared-universe size:

| Universe | Prepared Web before -> after (ms) | Prepared Native (ms) | Evidence Web (ms) | Evidence Native (ms) |
| ---: | ---: | ---: | ---: | ---: |
| 16 | 3.600 -> 3.544 | 6.999 -> 6.703 | 4.953 -> 7.821 | 8.145 -> 11.266 |
| 128 | 3.650 -> 3.607 | 6.994 -> 6.917 | 4.816 -> 7.944 | 8.283 -> 11.779 |
| 1,024 | 3.481 -> 3.516 | 6.724 -> 6.801 | 4.489 -> 7.729 | 7.706 -> 10.918 |

The new report deliberately costs more: it assesses/serializes each original
write. Do not run it by default in transforms or mistake it for the future
enabled planner's cost. The builtin generator's seven full same-process
samples, retaining the first, had median 28.63 ms and maximum 49.40 ms; this
includes theme reads, upstream loading/extraction and Rust formatting, not
module imports/startup or Rust-side construction. Generated Rust is 45,911
source bytes; the snapshot is 31,041 JSON bytes / 3,092 gzip. Those are build
data, **not** device bundle or peak-memory numbers. All samples, profile,
source/addon hashes and provenance are in local `assessment-clean-*`,
`assessment-prepared-*` and `assessment-portable-cost` receipts.

## Retaining the actual module across preparation

The next RFC 007 boundary is an internal, process-local staged path. A compiler
can `prepareWebModule` or `prepareNativeModule`, obtain the actual retained
utility names, await upstream ordering preparation, and `emit` that same owned
IR with an explicitly validated `PreparedTailwindContext`. The normal parse
and emit entry points use the same extracted functions. Suspension introduces
no inspection parse, no source reconstruction, and no second primitive-module
parse. Existing independent domains such as Canvas paints are not combined
into this handle, nor are additional passes inside existing experiments removed.

Handles retain source, owned IR and emission choices, not an allocator-backed
AST or an ID in a global map. The immutable theme is shared with `Arc`, not a
palette clone per file. Font diagnostic facts are snapshotted for staged calls;
helpers, forwarding, external StyleX facts and grammar have already been applied
to the retained parse. Compiler mutation during an await cannot reinterpret it.
Ordinary synchronous compilation does not create retained-module handles.

`emitTailwindModules` from `@hozo/compiler/project` takes ownership of an
explicit bounded batch and unions retained units with the caller's additional
lexical/cache candidates **before** awaiting its preparation callback. The
callback returns serialized descriptors; the helper validates/decodes once per
batch and requires an entry for every collected name before consuming any
module. `not-generated` is a collected fact; a missing candidate fails the
batch, not a rank-zero fallback. It never calls the mutable context setter.
Two batches on one compiler can therefore await different contexts safely.

Emission consumes the IR once. Explicit disposal is idempotent; the batch's
`finally` also disposes modules on preparation/validation/emission failure.
Disposing during a pending preparation makes later emission fail rather than
revive stale IR. This is not a built-in AbortSignal/timeout controller: callers
own cancellation and must reject preparation or dispose their pending handles.
Returned handles/context instances cannot be serialized to Metro workers or
persisted in a project cache. Bound batch size matters because source/IR are
retained while awaiting; peak memory is not measured here.

The callback must prepare the compatible project's stylesheet/theme and epoch.
Completeness/schema validation is not authentication of that relationship.
Watch invalidation, project-wide candidate caching, broader portable extraction,
and Vite/Metro/other adapter installation are still open. Forwarded summaries
without retained utility identity are not reconstructed by guessing strings.
No adapter default or cascade winner changes in this layer; it is an exercised
compiler/project boundary, not a claim that project integration is complete.

Local CPU-1/Idle/serial verification: Rust **1,033 passed**, compiler **339 passed
plus one existing Windows symlink skip**, Tailwind **61 passed**, Native Showcase
**223 passed plus one existing skip**, and cache guards **9 passed**. The addon
was rebuilt before JS checks; compiler build, workspace all-target Clippy,
format, generation/check, lint (1,657 files) and docs checks passed. A Rust test
mutates the retained IR, drops its originating compiler and verifies that exact
IR is emitted; state is empty afterwards. It also verifies shared theme identity.
Actual JS tests cover complete universes, secondary/nested slots, helper/option
mutation across await, overlapping batches, incomplete/invalid preparation,
executable CSS rejection, duplicate ownership, disposal, wrong context classes,
UTF-16/tag evidence, Native syntax diagnostics/metadata, forwarding/text ABI
choices and font snapshots. CLI TypeScript checks preserve Web/Native/mixed
result types and reject fake context objects/JSON strings.

Initial probes are retained: the first new fixture incorrectly assumed object
member classes were statically retained, and was corrected to the existing
constant-alias domain rather than expanding parsing in this PR. A mixed-batch
type probe found an inference gap; the overload and positive/negative type
fixture fix it. The type harness initially used the wrong relative root and
then needed TypeScript 7's explicit `--ignoreConfig`; both failures were fixed,
not skipped. The complete saved 30-subject/six-fixture/candidate-module output
control remains byte-identical. Native text fixture changes are receipts only.
Full root JS/packing/application suites, fresh browser/device pixels/AT, actual
WASM artifact sizes and peak memory were not run/measured locally.

Fresh clean debug builds compared parent `82653113` with implementation
checkpoint `dd52df3e` (later changes are documentation only). Five samples per
600 ordinary compiles: Web **70.5176 -> 69.3235 ms (-1.69%)**, Native
**83.2325 -> 83.9538 ms (+0.87%)**. A same-source implementation repeat was
68.9580/82.5241 ms (-2.21%/-0.85% relative to the original parent sample).
These observations are not proof of speedup or zero overhead. Resolver/data
consumer bundles remain 2,862/1,167, 11,259/2,608 and 82,464/14,567 bytes
minified/gzip; the runtime resolver and generated data are not changed.

The existing ledger's 1,026-candidate cold lookup initially rose from 1.2408 to
2.9522 ms (+137.93%), then 2.0945 ms in the implementation repeat. That was not
discarded as noise without a control: another fresh **parent-to-parent** capture
of identical source gave **3.2308 ms (+160.38%)**. This small mixed-workload
clock does not isolate a causal regression or certify a cold-runtime budget;
unchanged source/output bytes are the structural evidence, not a latency claim.
All `prepared-clean-*` and `prepared-parent-repeat` receipts remain available,
including other preparation/cache/state variation. No timer gate was weakened.

`node scripts/tailwind-order-module-cost.mjs` separately rebuilds and measures
seven samples over 16-module batches, 19 retained candidates and a real
288-color project theme. Medians below are **milliseconds per batch**, not
per-module times or sums of independent medians:

| Platform | Synchronous prepared control | Retain/collect | Decode/validate context | Emit retained IR | Complete async batch |
| --- | ---: | ---: | ---: | ---: | ---: |
| Web | 4.6172 | 3.0385 | 0.2484 | 1.0822 | 16.4673 |
| Native | 5.5830 | 3.0496 | 0.2561 | 1.9842 | 11.1215 |

The complete batch includes collection, asynchronous upstream preparation,
serialization, context setup, emission and cleanup. Upstream preparation
medians in those full batches were 11.8871/5.3788 ms, with first preparation
in each platform loop 11.4699/19.7197 ms; neither loop is a cold Node startup.
Standalone collect/context/emit clocks exclude upstream preparation. Compiler
construction/theme loading and nonempty font-availability snapshots are outside
this fixture's clocks. Every measured output is checked against the ordinary
compiler. No inference is made about application bundles, retained-memory peaks
or an enabled comparator. Full samples, Node/Rust/profile/source/addon/harness
receipts are in `prepared-module-cost.json` at the checkpoint above.

## One project epoch: reuse and cancellation

`TailwindProjectSession` from `@hozo/compiler/project` is an internal owner for
one immutable stylesheet/theme/config epoch. It collects actual module handles
synchronously, then shares their exact candidate universe's in-flight or ready
validated context without calling the global setter. It retains one ready
context and one last-pending index, not an output/source/IR cache. Distinct
universes prepare serially; a subset/superset is never a rank namespace hit.
Additional lexical candidates are normalized and captured before suspension.

The owner supplies stable module IDs (including derived query/platform identity
where necessary). A newer request for the same ID rejects the older pending
request and disposes its owned IR promptly, without aborting preparation that
another request still shares. An obsolete queued universe is skipped before
preparation. The return boundary checks cancellation again, so a source update
between synchronous emission and async delivery cannot return that stale result.
Invalidating the project permanently closes the session, drops ready context
and compiler references, rejects waiters and releases their IR without waiting
for a non-cooperative preparation callback. Late results cannot decode/install
or revive the closed epoch. Failures do not poison the serial queue or replace
an earlier valid ready context. These operations do not retry old source.

This is **not** a filesystem watcher or default Vite/Metro integration. The
adapter must observe CSS imports/config and invalidate/recreate a matching
compiler/theme/session; schema/completeness checks do not authenticate those
relationships. A real imported stylesheet fixture observes the dependency,
changes its spacing token, replaces the epoch and verifies both the new 8-to-16
pixel padding and a different descriptor fingerprint. It uses fresh static-safe
theme loading, not a claim that existing adapter theme caches are refreshed.
Callers must bound active batches/requests: pending requests still own source/IR
and a serial backlog still has per-request metadata. An already-running upstream
operation may finish after all its source requests are cancelled; only project
invalidation aborts its cooperative signal. There is no durable/worker cache.

CPU-1/Idle/serial checks: compiler **339 passed plus one existing Windows symlink
skip**, Tailwind **71 passed** (10 session tests added to the parent's 61),
cache guards **9 passed**, compiler/Tailwind builds, lint (**1,659 files**) and
generated docs checks passed. The CLI type fixture checks single/mixed result
types and rejects asynchronous collectors. Real Web and Native emissions share
a context while preserving complete outputs. The saved 30-subject, six-fixture
and generated Native candidate output control remains byte-identical. No Rust,
device runtime, winner policy or adapter default changed in this layer.

Probe failures are preserved: mixed collector inference needed the whole
collector type rather than inference through its return type; the positive and
negative CLI fixture now pass. Partial collector/throwing iterator tests cover
an ownership trap found during helper refactoring and keep both eager and factory
batches covered. A deliberately failing delivery-race regression showed a stale
result resolving after supersession; the final return check fixes it. No test
was skipped or timeout/expected output weakened to obtain these results.

The extended `node scripts/tailwind-order-module-cost.mjs` rebuilds the addon
and measures seven samples over the same 16 modules / 19 candidates / 288-color
theme. At clean implementation checkpoint `246275d6`, medians are milliseconds
for all 16 modules, not per-file times or sums of independent medians:

| Platform | Preinstalled synchronous control | Fresh async batch | Warm session batch | 16 sequential warm file requests |
| --- | ---: | ---: | ---: | ---: |
| Web | 4.9906 | 20.4328 | 5.2787 | 6.8445 |
| Native | 6.1921 | 11.1280 | 6.2204 | 8.3662 |

Each platform's session preparation callback runs exactly **once**, including
first-use and all later batch/file samples; every output matches the ordinary
compiler. First session uses were 47.3934/14.2484 ms, after theme loading and
compiler construction, **not cold Node startup**. Warm batch maxima were
5.7376/6.6431 ms; sequential-file maxima 8.3121/9.5695 ms. Normalization,
collection/emission, cancellation tickets and async boundaries remain measured.

Sequential file requests are visibly costlier than the preinstalled synchronous
control; this is not a zero-overhead API or permission to install it universally.
Actual adapter candidate amortization and representative transform costs must
be resolved/measured before default integration. The initial clean checkpoint
`2581efe7` capture (before the delivery-race fix) is also retained: synchronous
5.9472/6.4941, fresh batch 21.8745/11.3731, warm batch 5.6687/6.1721 and warm
files 8.9600/8.7111 ms. Neither capture establishes an application speedup or
a causal default-entry regression. Full samples/toolchain/source/addon/harness
receipts are in `session-module-cost.json` and `session-module-cost-final.json`.
No invalidation latency, large-universe normalization, startup/peak memory,
full root JS/packing/application suite, fresh browser/device pixels/AT, WASM
artifact size or enabled cascade comparator was measured in this layer.

### Ready-context path: remove machinery for a wait that does not happen

The next change keeps a lightweight request ticket for supersession/epoch
checks but creates its AbortController/combined signal only on a context miss.
Ready contexts return directly to the shared emission path, without a resolved
context Promise or abort-wait listener. The public session API still returns a
Promise and checks cancellation before delivery; synchronous emission is not
permission to deliver a result invalidated in the intervening microtask.
Cold/in-flight paths retain cooperative cancellation and immediate IR disposal.
No ordinary compiler entry, resolver, default adapter or ordering winner changes.

A structural regression traps `AbortSignal.any` after priming a context:
ready emissions must not call it, even while a newer same-ID request supersedes
the old result before delivery. A separate test invalidates a ready result's
project between emission and delivery. The original ten session tests remain.
Compiler **339 passed plus one existing skip**, Tailwind **73 passed** (two
added), and the saved 30-subject/six-fixture/candidate output is byte-identical.
The structural test failed on the parent as intended. Its initial output
equality assertion accidentally compared an opt-in plan report to a normal
compile; it now excludes only that diagnostic report, as existing tests do.

The unchanged seven-sample module-cost harness rebuilt each clean revision,
CPU 1 / Idle / serial. Parent `86b52203` versus implementation `4abb164a` and a
same-implementation repeat, in milliseconds per **16 modules**:

| Capture | Web warm batch | Web 16 warm files | Native warm batch | Native 16 warm files |
| --- | ---: | ---: | ---: | ---: |
| Parent | 5.3931 | 7.3786 | 6.3429 | 8.9454 |
| Implementation | 5.3190 | 7.3451 | 6.8020 | 8.5569 |
| Implementation repeat | 5.1903 | 7.0766 | 6.3943 | 8.1713 |

Preparation still runs once per platform session, every emitted output matches
ordinary compilation, and all samples are retained (`ready-parent-cost.json`,
`ready-after-cost.json`, `ready-repeat-cost.json`). This removes identified
allocations, not all per-file cost: the observed file medians remain above each
capture's preinstalled synchronous control. Those synchronous Web/Native
controls were 5.1631/6.4857, 5.2424/7.1387 and 5.6914/6.4166 ms respectively;
the unchanged ordinary path's variation is also reported, not selected away.
These captures do not prove application speedup, zero overhead or a causal
default-entry regression. The first-use/upstream costs remain in the receipts.
Actual adapter integration/amortization, large universes, startup/peak memory,
full root/pack/app suites, fresh browser/device/AT and enabled cascade winners
remain outside this measurement.

## Staging the real Web lowering pipeline

`prepareLowerModule` from `@hozo/compiler/lower` now reaches the actual module
pipeline, not a separate primitive-only probe. React Native runtime import
rewrites and Canvas paint edits run before `prepareWebModule`, whose retained
source and spans therefore describe the **post-Canvas** text. The same finish
function serves ordinary `lowerModule` and staged emission: component CSS/JSX
namespaces and source copies, import cleanup/runtime imports, client-boundary
facts, residue policy and dependency-resolution diagnostics are not copied
into a second adapter implementation. Ordinary lowering remains synchronous
and does not allocate a prepared-module handle.

The staged wrapper snapshots policy/observer identity before suspension. The
primitive handle captures StyleX/helper/parse facts then, not at later emission.
Owned continuations clear on emit/dispose, including exceptions; a collision
or observer error cannot leave a retryable half-consumed lowering. Ineligible,
empty, runtime-import-only and Canvas-only cases retain their early-result
contracts without a primitive parse, through a one-shot zero-candidate wrapper.
A session may still prepare the supplied project universe for these wrappers;
this is not an optimized adapter-level bypass. No bundler filesystem writes
occur here. Analysis observers can already have seen pre-suspension stages;
callers must not publish those as a completed transform after cancellation.

Seven integration tests cover full output **and every observed stage**, plain
and derived module IDs, UTF-16 text, nested Canvas edits/diagnostics, secondary
slots, foreign JSX, local/imported StyleX, graph/registry mutation during await,
captured warn-policy/observer identity, one-shot/error/dispose behavior and
source supersession before old semantic edits are observed. A structural test
requires exactly one Canvas pass and one primitive preparation of rewritten
source, and makes ordinary primitive compilation/default residue parsing throw
if invoked. A valid context is constructed outside the disposal assertion so
schema failure cannot make that ownership test pass accidentally. The existing
extra residue parse remains only for explicit warn/error policy; this layer
does not remove independent domain parsers or claim a single whole-file parse.

CPU-1/Idle/serial: compiler **339 passed plus one existing Windows symlink
skip**, Tailwind **80 passed**, source-cache guards **9 passed**, compiler
build, lint (**1,661 files**) and generated docs checks passed. The CLI fixture
checks full-lowering result inference and rejects a primitive-array result
claim. The saved 30-subject/six-fixture/Native candidate output stays
byte-identical. No Rust/device resolver, default adapter, cascade winner or
conformance denominator changes. Full root JS/pack/application suites, fresh
browser/Native pixels/AT, actual WASM sizes and peak memory were not measured.

`node scripts/tailwind-order-lower-cost.mjs` rebuilds the debug addon and times
seven samples over 16 synthetic modules (20 lexical candidates, 288-color
theme), including nested Canvas, local StyleX, secondary slots, UTF-16 and
derived IDs. These are full Web pipeline clocks, not Native full lowering or
an application benchmark. Theme/compiler construction and project discovery
are outside synchronous/warm clocks. Before revision `9b5b9a59` adds only the
harness over #1260; implementation checkpoint `6012b125` adds the staged
boundary. Subsequent rebase onto merged #1260 changed no file content.
Post-checkpoint lifecycle refinements change tests/docs only, not the measured
production code or harness.

| Capture (ms per 16 modules) | Ordinary synchronous | Warm staged batch | 16 warm staged files |
| --- | ---: | ---: | ---: |
| Before | 9.7950 | not available | not available |
| Implementation | 10.1484 | 10.8177 | 11.2338 |
| Implementation repeat | 9.8508 | 10.5532 | 10.9261 |

Ordinary-path differences against the before median were +3.61% and +0.57%,
not a repeatable >5% default regression or proof of zero overhead. Staged
batch/file costs remain above their synchronous controls: approximately
6.6–7.1% / 10.7–10.9% respectively. **That is a performance-review stop for
default installation under RFC 007, not a waived budget.** This internal
boundary provides correct retained work and honest full-pipeline evidence;
next, a ready-context path must avoid unnecessary cold-path retention/
suspension costs without reparsing primitives, guessing completeness or
dropping unassessed classes. Actual adapter amortization/watch integration and
matching compiler/theme epochs still remain, as do broader portable evidence
and the shared comparator/candidate fallback. Nothing enables new winners.

Each staged capture prepares once; first uses were 40.5638/31.9283 ms, not cold
Node startup. All output/fixture/harness hashes match across before and after;
the full output digest is `70282f0fb2e859eeb37e4bb16010cdbe2d0b9c234f866fdfc8ea370cbdc94ea0`.
All samples/provenance are retained in `lower-parent-cost.json`,
`lower-after-cost.json` and `lower-repeat-cost.json`. The earlier dirty-tree
pilot is separately retained, not substituted for clean comparisons. No
startup/large-universe/invalidation latency, memory peak or app-speedup claim.

## Ready attempts check the actual parse before emitting

The internal Node `compileWebOrPrepare` parses once and checks every retained
utility name against a validated `PreparedTailwindContext`. A complete parse
emits within the Rust call: no JS retained-module handle, candidate-name
marshalling, font snapshot or later handle-emission call is required. There is
still a local Rust IR owner during the call; this is not a zero-allocation claim.
A missing candidate returns **that exact owned IR**, not partial output or a
second parse. A Rust pointer/mutated-IR test proves this identity; `not-generated`
is a complete collected entry, not a reason to erase an unknown utility.

`lowerModuleOrPrepare` uses the same post-Canvas pipeline and finalizer as
ordinary/staged Web lowering. `TailwindProjectSession.runModule` shares the
existing request tickets, cold/in-flight preparation and pre-delivery guards.
Only an **exact** lexical-universe key can offer the ready context; Rust still
checks actual parsed names, including names absent from that lexical snapshot.
Misses extend preparation from the returned handle. A stale subset cannot reuse
a superset's ranks on the next call. The API deliberately attempts **one** module,
not mixed early-emitted batches whose later module could expand the namespace.
The internal attempt callback is trusted compiler orchestration, not a security
boundary certifying arbitrary caller-supplied `complete` results.

`TailwindCandidateUniverse` freezes/copies/deduplicates names and computes the
key once per caller-owned candidate revision. Warm calls avoid repeated
project-set sorting/stringification; mutable iterables can still be supplied
but are snapshotted per call. This is not a mutable identity cache. It does not
replace project stylesheet/theme epoch invalidation, source discovery or actual
IR completeness. Owners must reconcile candidates outside the lexical revision
before expecting future ready hits. Existing batch emission remains available.
Independent early-return/Canvas-only domains can complete without any ordering
preparation; their pre-suspension observer facts are not a completed transform
receipt. No app provider, device resolver or default adapter change is introduced.

CPU-1/Idle/serial verification: Rust **1,035 passed**; rebuilt addon before JS;
compiler **339 passed plus one existing Windows skip**; Tailwind **88 passed**
(eight new ready-attempt tests); Native Showcase unit/driver-policy tests
**223 passed plus one existing skip**; source-cache guards **9 passed**.
Compiler build, all-target workspace Clippy, formatting, lint (**1,662 files**),
generated fixture/check and docs checks passed. Native text fixture changes are
two compiler-source hash receipts only. The saved 30-subject/six-fixture/Native
candidate output remains byte-identical. Type fixtures reject async attempts
and incorrect primitive-result claims. Tests cover direct output/observed-stage
parity, missing actual candidates with no reparse, exact namespaces, unknown
classes, immutable revisions, warm cancellation, already-created owner disposal,
cross-API request supersession, and invalidation during candidate iteration.

Initial seven-sample fixed-order captures (`direct-parent-cost`, `direct-pilot`,
`direct-universe-pilot`) are retained. Their clocks did not establish a reliable
whole-pipeline gain: the new path always ran last, and built an extra file ID
inside its clock. A separate nine-round/100-call primitive probe showed smaller
direct-call than retained-call costs, but did not prove whole-pipeline speedup.
The harness was therefore corrected rather than choosing the favorable cells:
all paths use preconstructed input IDs; stage order rotates; **12 samples**
balance the old three and new four paths (LCM 3/4). First observations remain,
with no forced GC, discarded warm-up rounds or timer gate changes. Immutable
candidate-revision construction is outside warm clocks, just as theme/compiler
and project preparation are; its setup/large-universe cost is not measured.

The identical final harness was run on parent `a40f5466` and implementation
`9cadf36c`, each with a fresh debug addon, 16 full Web modules, 20 candidates and
the same 288-color theme. Parent receipt has `dirty=true` **only because that
measurement script was temporarily replaced**; its production-source hash is
unchanged from the earlier clean parent. The script was restored, the working
branch returned clean, and its addon rebuilt before further checks.

| Balanced capture (ms per 16 modules) | Synchronous | Retained batch | 16 retained files | 16 direct-ready files |
| --- | ---: | ---: | ---: | ---: |
| Parent | 8.9557 | 9.4129 | 10.2062 | unavailable |
| Implementation | 8.8170 | 9.3180 | 10.4591 | 9.2987 |
| Implementation repeat | 9.0357 | 9.4893 | 10.2511 | 9.1801 |

Direct-ready medians are about **11.1% / 10.4% below** retained files in their
capture, but **5.46% / 1.60% above** the synchronous controls. The ordinary
control versus parent is -1.55%/+0.89%; none of these small clocks proves an app
speedup or zero overhead. The first comparison remains over 5%, so this is not
blanket default-performance acceptance. Keep broader/large-universe/actual
adapter measurements and RFC 007's gate open, rather than selecting the better
repeat. Older retained-file costs do not disappear by adding this new route.

Full samples, stage orders and provenance are in `direct-balanced-parent.json`,
`direct-balanced-after.json`, `direct-balanced-repeat.json`; earlier clean
seven-sample rotating captures (`direct-final-cost`, `direct-repeat-cost`) are
also retained. Every emitted result matches the ordinary pipeline, preparation
runs once per session, and all fixture/output hashes match the prior full-pipeline
control. No whole app, Native full lowering, actual Vite/Metro watcher integration,
new cascade winners, fresh browser/device pixels/AT, full root/pack/app suite,
actual WASM/production bundle sizes, startup/peak-memory or broad coverage claim.

## Native ready attempts and larger candidate universes

`compileNativeOrPrepare` uses the **same** Rust candidate-completeness helper
as Web: a hit returns the full `CompiledNativeModule`; a miss retains the
exact parse, options and theme for later emission. Source-file/binding metadata,
syntax diagnostics, forwarding, font diagnostics and each supported text ABI
option are preserved. A ready result means ordering preparation is complete,
not that the source has no syntax errors, all utilities are supported or Native
pixels/AT have passed. Module diagnostics remain part of the result.

Two new Rust tests cover Native direct output, option validation and retained
pointer/mutated-IR identity on a miss. Six Tailwind tests compare complete Native
modules across metadata/grammar/ABI cases; prove forwarding/options/font facts
are captured on a miss; reject invalid ABI combinations; prohibit a second JS
prepare/ordinary parse/global setter/wait signal on a ready session; and preserve
pre-delivery cancellation. A 1,026-name test puts `p-2048` in a **later separate
root**: both Web/Native must return retained handles, then emit the old parse
under the expanded context with unchanged output. The Metro test substitutes a
known-complete ready compiler **only in the test**, verifying exactly one call
from post-Canvas source and identical full transformed code. It does not install
an adapter route or make the synchronous transformer await preparation.

CPU-1/Idle/serial: Rust **1,037 passed**, compiler **339 passed plus one existing
Windows skip**, Tailwind **94 passed**, Metro **76 passed**, Native Showcase
unit/driver-policy **223 passed plus one existing skip**, cache guards **9 passed**.
Addon/Compiler build, all-target Clippy, formatting, lint (**1,670 files**) and
docs/fixture checks passed. Only two compiler-source hash receipts changed in
the generated Native fixture. The saved 30-subject/six-fixture/Native candidate
output remains byte-identical. Turbo dry-run includes both new tests and their
actual package build dependencies; no raw-source probe or unrelated cache input
was added. No runtime, adapter default, conformance denominator or winner changes.

`node scripts/tailwind-order-ready-matrix.mjs` is a new opt-in **module-entry**
benchmark, not the earlier full Web pipeline clock or a full Metro/app benchmark.
It uses the same 16 source modules / real 288-color theme on both backends and
20, 256, 1,026 actual Tailwind candidates: retained source names plus padding
utilities, **not** a broad utility-coverage corpus. The identical harness ran on
clean parent `bacca7b2` (harness only over main `379e66d0`) and clean implementation
`507ba223`, with rebuilt debug addons, 12 samples and balanced clock positions.
Every output matches its normal module control; preparation runs once per session.

Medians below are **milliseconds per 16 modules**; paired values are first
implementation capture / same-source repeat, not best/worst selections:

| Backend | Candidates | Synchronous | Retained files | Ready, shared revision | Ready, mutable iterable |
| --- | ---: | ---: | ---: | ---: | ---: |
| Web | 20 | 4.3827 / 4.3739 | 5.3099 / 5.3428 | 4.5677 / 4.5926 | 4.7943 / 4.7508 |
| Web | 256 | 4.3534 / 4.2573 | 6.0418 / 5.9674 | 4.5138 / 4.4824 | 4.9890 / 4.8735 |
| Web | 1,026 | 4.3365 / 4.2686 | 6.4643 / 6.2341 | 4.5928 / 4.4893 | 5.7972 / 5.6618 |
| Native | 20 | 5.4333 / 5.3021 | 6.5386 / 6.4044 | 5.8505 / 5.5782 | 5.8123 / 5.5918 |
| Native | 256 | 5.4825 / 5.3480 | 6.6713 / 6.4581 | 5.5064 / 5.3703 | 5.9889 / 5.8212 |
| Native | 1,026 | 5.3535 / 5.2676 | 8.0381 / 7.7941 | 5.4370 / 5.5223 | 6.8979 / 7.0074 |

At 1,026 names, sharing a ready revision instead of the retained per-file path
reduces these Native clocks by about **32.4% / 29.1%**, Web by 29.0% / 28.0%.
Reconstructing from an iterable inside every file visibly loses that benefit.
This does **not** waive the synchronous-control budget: Native's 20-name ready
cells are **+7.68% / +5.21%**, Web's 1,026-name cells **+5.91% / +5.17%**.
They repeatedly exceed 5%; the RFC 007 **default-installation review stop stays
open**. Do not assume a larger real file will remove the difference or select
another matrix row as blanket acceptance. Actual project/adapter evidence is
still required. The ordinary parent controls also differ between captures;
no ordinary-path speedup is attributed to this change.

The shared per-size setup was measured separately (same samples reported in
both backend rows, not independent platform setup timings). Initial capture
universe-construction medians at 20/256/1,026 names were **0.0063 / 0.0213 /
0.0810 ms**, decode-plus-completeness **0.2099 / 2.0982 / 8.1498 ms**.
Repeat values were 0.0041/0.0234/0.0799 and 0.1795/2.0975/8.2238 ms. Upstream
preparation/serialization was 24.3073/33.7094/20.8468 ms, repeat
11.9086/17.8759/19.2664 ms; these are sequential warm-process observations,
not cold Node/project startup. All first-session values and raw samples remain.

Receipts: `native-ready-parent.json`, `native-ready-after.json`,
`native-ready-repeat.json`; the earlier dirty-tree pilot is separately retained.
No selected-pass filtering, forced GC, discarded warm-ups or CI timer threshold.
No actual adapter/watch/theme-epoch installation, representative app/full Metro
timing, fresh browser/device pixels/AT, full root/pack/app suite, WASM/production
bundle size or startup/peak-memory claim. The new host compiler entry does not
change generated app imports or introduce a device-side context subscription.
