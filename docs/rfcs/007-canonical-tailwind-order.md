# RFC 007: One Tailwind ordering plan before platform lowering

- **Status**: Captured Vite/Metro/Next project sessions and Metro dynamic maps
  default to shared assessed scalar winners. Broader domains remain open.
- **Authors**: codex-1
- **Tracking issue**: [#1230](https://github.com/iray-tno/hozo/issues/1230)
- **Target packages**: compiler/parser/IR/Web/Native, `@hozo/tailwind`,
  `@hozo/engine`, and their build-tool adapters.
- **Baseline inspected**: main `99e9c03a61aaa80c86893fbea72c25df431f86ce`.

The implementation history below records staged measurements; statements
about earlier unswitched adapters describe those stages, not the current
default. The latest boundary is summarized immediately before section 1.

Phase 2 now includes a shared pass-through compile plan, bounded original-rule
ownership/specificity evidence and an opt-in generated **exact-candidate**
portable bootstrap. These are not value/condition equivalence or enabled
cascade winners. The 90-entry bootstrap is not a complete portable context;
adapter collect/prepare/emit integration and broader extraction remain open. See the
[measurement and limits](../measurements/canonical-tailwind-order.md#per-rule-ownership-and-a-portable-bootstrap).

An exercised internal Node compiler/project boundary can now retain the actual
module across async preparation and consume it once at emission. It validates
one complete context per bounded batch without a global setter or another
primitive-module parse. A process-local project session now reuses an exact
candidate universe's immutable context and cancels superseded module requests
or an invalidated project epoch. Default adapter installation, actual watcher
integration and broader portable extraction are not complete; no new winners
are enabled. Ready hits now avoid wait-only signal/Promise machinery, while
retaining cancellation checks before delivery. Sequential per-file session
costs still need attention before default installation; avoiding preparation
is not zero transform overhead.
See [retained-module evidence](../measurements/canonical-tailwind-order.md#retaining-the-actual-module-across-preparation).
See also [session reuse and cancellation](../measurements/canonical-tailwind-order.md#one-project-epoch-reuse-and-cancellation).

The staged boundary now also reaches the real Web `lowerModule` pipeline:
Canvas rewrites precede the retained primitive parse, and synchronous/staged
emission share the same namespace/edit/import/diagnostic finalization. This
now reaches the default Vite integration described below; other adapters remain
pending. Full-pipeline warm measurements
exceed the synchronous control by more than 5%, which triggered performance
review rather than a timer-based CI failure. The later small-example review
below accepts the measured absolute costs; actual project integration still
needs its own correctness and cumulative-cost evidence. A ready context should
not require cold-path retention/suspension machinery forever.
See [full-pipeline evidence](../measurements/canonical-tailwind-order.md#staging-the-real-web-lowering-pipeline).

A single-module ready attempt now checks actual parsed candidates in Rust,
emits directly on completeness, or returns that exact retained parse on a miss.
An immutable lexical-universe revision amortizes key normalization without
substituting for this check. Balanced full-pipeline measurements reduce the
retained-file cost, but do not themselves graduate adapter defaults; see
[ready-attempt evidence](../measurements/canonical-tailwind-order.md#ready-attempts-check-the-actual-parse-before-emitting).

Native now has the same actual-parse ready/miss contract, preserving its full
module metadata and text ABI. A 20/256/1,026-candidate matrix measures revision
construction/context setup separately from both backends' warm module calls.
It confirms the benefit of sharing a revision, not universal performance
acceptance. Following review on 2026-10-25, the measured Native small-example
increment of about **17–26 microseconds per module** is accepted as a build-time
tradeoff. A small fixture crossing 5% alone no longer blocks progress. Retain
all observations and judge actual integration by absolute and cumulative
project cost, separately from device render/cache-hit performance.
See [Native/matrix evidence](../measurements/canonical-tailwind-order.md#native-ready-attempts-and-larger-candidate-universes).

Metro now also has an internal full-transform ready/retained boundary after
Canvas rewriting, sharing ordinary Native finalization rather than injecting
a partial compiler in a test. Complete module metadata, diagnostics, hook slots,
namespaces and imports survive async preparation. The subsequent default
worker/config installation is described below; no Native-only cascade changes
are enabled. See
[Native staging evidence](../measurements/metro-tailwind-stage.md).

The read-only project snapshot now captures one entry/import graph and derives
both theme and ordering contexts from those same bytes. Its dependency paths
include absent discovery entries; a future watcher must replace the matching
compiler/session and invalidate dependent outputs when they change. Candidate
preparation rebuilds Tailwind's mutable analysis state from captured CSS, rather
than sharing a registry whose variant keys depend on preparation history.
That snapshot layer did not itself switch adapters. See
[snapshot evidence and limits](../measurements/canonical-tailwind-order.md#one-captured-project-stylesheet-epoch).

Vite build/dev now use that captured epoch and `runModule`/`lowerModuleOrPrepare`
by default when the snapshot is available. Candidate CSS uses the same snapshot;
CSS dependency/discovery edits retire the matching compiler/session, reject late
code delivery and invalidate already transformed dev modules. An approximate,
no-AST ordering seed includes static classes **without** adding them to runtime
candidate CSS. Actual parsed units still expand an incomplete seed; warm files
use the ready path. Unassessed/broken configuration preserves the existing warned
lowering path, never a fabricated canonical context. Complete
production-wide reconciliation of transformed-only additions, new common cascade
winners and broader portable extraction remain open. See
[Vite integration evidence](../measurements/canonical-tailwind-order.md#default-vite-epoch-and-session-integration).

Metro's configured default now transports the config process's captured CSS
bytes/import edges and full lexical seed to per-worker/per-platform sessions.
The runtime candidate module and primitive compiler consume the same theme.
Actual post-Canvas parsed candidates remain authoritative on a miss; no global
context setter or ordinary reparse is installed. Startup cache keys include the
captured graph and config facts. CSS/helper changes still require Metro restart,
as the candidate map already did; this is not a live whole-graph invalidator.
Unknown/broken CSS keeps warned legacy lowering, not a fabricated context.
Production-wide reconciliation across worker namespaces remains necessary
**before enabling shared winners**, along with broader portable facts and the
common comparator. See [Metro worker evidence](../measurements/metro-tailwind-workers.md).

Next now installs the same actual post-Canvas ready/retained lowering by
default while keeping `withHozo` synchronous. Each loader worker owns its
captured theme/compiler/session. Loader-declared stylesheet dependencies and
warm metadata checks retire changed epochs; stale source/config deliveries
cannot publish module CSS. Candidate CSS order is awaited under that same
snapshot. Full resource/query IDs isolate pending requests and candidate rows.
This does not synchronize final namespaces across workers, make filesystem
capture atomic, or enable new winners. See
[Next loader evidence](../measurements/next-tailwind-session.md).

Global reconciliation now has its first shared boundary: opaque per-file native
candidate scan facts can be exported/replayed without a second scan. Compiler/
project assembles them against adapter-supplied full source IDs and validated
revisions, deduplicates equal worker observations, drops absent inputs and
returns no publishable partial cache when data is missing/stale/conflicting/
incompatible. This is runtime source-fact completeness only, not static-unit or
final ordering-context completeness. The cache also validates persisted trusted-
source policy before accepting an mtime hit; internal snapshot format 5 discards
unproven older data once. The next layer must bind these records to
the actual authored-content plus derived-module graph and real cached-transform
receipts before final context/emission; no unsupported cached-module hook may
stand in for that lifecycle. See
[contribution replay evidence](../measurements/candidate-source-reconciliation.md).

Vite production builds now attach those native facts to transform metadata and
check them against final `moduleParsed` code and `getModuleIds`/`getModuleInfo`.
Configured content remains independently authoritative, including unimported
files; absent derived modules do not survive merely because a physical cache
entry exists. An internal inventory records complete/incomplete source facts,
never final ordering readiness, and does not change candidate CSS or winners.
Query modules without their own observation remain explicitly incomplete.
Eligible query inputs now acquire independent native scan receipts, without
overwriting their physical authored cache entry; see
[query-source evidence](../measurements/vite-derived-candidate-facts.md).
Real small Vite builds exercise these hooks; JSON receipt replay is covered,
but real cached-transform reuse is not yet proven. See
[Vite graph inventory evidence](../measurements/vite-candidate-inventory.md).

Prepared contexts now also expose one lazily cached Rust rule-emission index.
It compares full signatures and preserves every rule, rather than sorting by
an individual candidate's first-rule rank. The build-time `ruleOrder()` result
includes its namespace fingerprint; there is no per-family comparator or
device ordering helper. Independent Tailwind CSS positions validate builtins,
owner variants, duplicate custom utilities and stable equal-key rule order.
This does not by itself change cascade winners; see the subsequent priority
integration below. Final static/candidate publication remains necessary.
See [the common comparator and limits](../measurements/tailwind-rule-comparator.md).

Actual captured Web/Native write plans now consume shared assessed priority
keys: importance, original selector specificity, then the common emission
sequence. Root and secondary slots use the same immutable context. Unknown
rules and ambiguous ownership retain reasons without fabricated ranks; the
plan still emits its original pass-through declarations. An independent
Tailwind browser oracle agrees on eight overlapping-state/importance cases.
These are bounded same-tier matched-rule facts, not permission to cross
authored evaluation, input, predicate or platform boundaries. Generated
fallback metadata and final namespace publication must use this same source
before output winners switch together. See
[write-priority evidence and limits](../measurements/tailwind-write-priority.md).

Candidate generation now has a build-time-only sidecar from its actual pass,
using the same IR write evidence as static plans. It records emitted object
locations, real predicate keys and per-write priorities. Nonuniform/unknown
groups do not borrow a first-rule rank. The ordinary generated module is
byte-identical, so this is not yet a runtime ABI or winner switch. A remaining
`p-2!` extraction/lowering gap was observed during comparison; upstream priority
facts alone do not solve it. See
[candidate generation evidence](../measurements/tailwind-candidate-priority.md).

Important syntax is now recognized for an explicit cross-platform refusal,
not silently omitted from scans or parsed as a malformed color. Static owners,
Native fallback and audit name the unsupported behavior; scan cache version6
invalidates the old missed names. No normal declaration is substituted for
an important one. Full important-aware output remains part of the shared
switch, not a coverage win from diagnosis. See
[the safety correction and remaining work](../measurements/tailwind-important-diagnostics.md).

The generated candidate sidecar now supplies a compact physical-scalar order
contract when actual emitted keys conflict. The engine can consume that
versioned object ABI, sort once at cache fill and cache a rank-free template;
state updates only select entries. Unknown objects keep the entire string on
its legacy path. Actual generated maps agree with upstream browser winners
in an explicit new-ABI probe, including a negative old-winner control. No
adapter/default output switch is made yet. Cold allocation/sort costs are
measured and remain part of adoption review; see
[template correctness, payload and cost](../measurements/tailwind-resolver-template.md).

The compiler core can now move assessed scalar writes in the actual IR and
preserve their ordered guard sequence through both lowerers. A source-built
Rust driver feeds an independent browser oracle, including the old-winner
negative control; this is not another report-only comparator. Ordinary adapter
installation remains pass-through until final static/fallback namespaces can
be switched together. The explicit planner's nonzero build-time costs and its
predicate/platform barriers are recorded in
[static scalar-plan evidence](../measurements/tailwind-static-scalar-plan.md).

A bounded publisher now reconciles current runtime facts with actual retained
module units, prepares once and emits every module plus the Native candidate
plan through that exact context object. Missing/stale inputs and late failures
expose no partial publisher cache/output. This finite owned batch is not a
whole-worker graph protocol, adapter default switch or theme-equivalence proof;
see [batch publication and measured limits](../measurements/tailwind-final-batch.md).

Completed finite batches now use an immutable scalar-output context for both
actual static lowerers and the emitted Native resolver factory call. Its
policy-qualified fingerprint separates these outputs from pass-through cache
entries. Static and candidate eligibility share actual-owner/single-rule
assessment, not just matching rank numbers. The independent browser probe now
also exercises that actual final publisher and generated call. This is bounded
coordination, not default adapter graduation or final Web candidate stylesheet
publication; see [output evidence and limits](../measurements/tailwind-final-output.md).

Web import discovery can now borrow the actual owned post-Canvas parse, return
its initial module structure and consume it later for final CSS. The final
continuation rejects any changed JS/import/client-boundary structure rather
than patching already parsed code. This avoids waiting for the whole graph
inside a transform, but does not itself deliver late CSS or switch an adapter.
The additional preview render has measured build-time cost; see
[the Web continuation boundary](../measurements/tailwind-web-style-continuation.md).

The Vite final-graph shadow route was measured and has now been removed. It
retained every live IR and emitted styles a second time without delivering
them to assets. For the assessed scalar domain, local-rank invariance makes
that global numeric namespace unnecessary. Ordinary transforms now emit the
shared winner directly before companion imports are consumed. Vite, Metro and
Next captured sessions switch together with Metro's generated dynamic map;
unassessed inputs and explicit pass-through contexts retain their old behavior.
Generic finite-batch/preview APIs remain internal and tested for bounded
offline callers, not as a production graph dependency. Runtime candidate
inventory remains independent evidence, not a claim that its final union is
the active Web stylesheet. See
[default activation and scope](../measurements/tailwind-default-order.md).

The default domain now also includes twelve direct-key projection types
(opacity, numeric z-index, flex direction/grow/shrink and alignment, text
alignment/transformation and normal/italic font style). Static and candidate
eligibility share one ownership mapping, not new family order tables. Output
policy v2 invalidates caches from the smaller v1 domain. Font registrations,
compound text metrics, gap/logical aliases and transform registers remain
explicit next boundaries rather than assumed scalar projections; see
[evidence and remaining scope](../measurements/tailwind-simple-projections.md).

Policy v3 adds named font-weight ordering and actual project-value resolution.
Hoisted `@property` definitions are assessed as non-owner metadata only for
their closed registration shape; arbitrary hoisted selectors/directives are
still barriers. The parser retains named tokens separately from authored
absolute weights, preventing project overrides from changing StyleX/semantic
constants. Invalid Native theme values are diagnosed on use, not rounded or
replaced. Compound font metrics remain open; see
[font-weight evidence](../measurements/tailwind-font-weight-order.md).

Policy v4 adds existing absolute font-size/line-height/letter-spacing writes.
Font-size fallback line-height retains its register semantics on Native and in
the generated map. The legacy condition-weight sorter is bypassed for a
single entirely canonical input; mixed-input ADR011 composition is unchanged.
Ratio/`em` recomputation, slash parsing and text-size theme values are not
newly supported by this slice. See
[absolute text metric evidence](../measurements/tailwind-absolute-text-order.md).

## 1. Restart, not another family-specific patch

PR [#1237](https://github.com/iray-tno/hozo/pull/1237) is closed as superseded and must not be
an implementation dependency. Its current-head CI test job failed. This RFC
does not diagnose or repair that failure, retry it, or treat its successful
focused probes as release acceptance. Preserve its branch and evidence.

Keep the merged source-boundary and owner-interaction corrections from
#1234/#1235. Replace the proposed spacing-only ordering model, rather than
adding parallel color, typography, sizing and border sorters beside it.

Ordering is necessary compatibility work. Utility definitions, platform
property normalization and cascade ordering are nevertheless different jobs.
The goal is one build-time ordering model whose results every backend uses,
not a second CSS engine on the device or a smaller implementation obtained
by refusing previously supported classes.

## 2. What upstream does, and what it does not do for us

The installed reference is Tailwind 4.3.3. Its
[candidate compiler](https://github.com/tailwindlabs/tailwindcss/blob/v4.3.3/packages/tailwindcss/src/compile.ts)
orders generated rules using variant order, the full ordered property
signature, declaration count, and an alphanumeric candidate-name tiebreak.
The [property table](https://github.com/tailwindlabs/tailwindcss/blob/v4.3.3/packages/tailwindcss/src/property-order.ts)
is shared across utility families. A sample root with one property is not a
general signature: font-size utilities can also write line-height/registers.
Do not derive these keys from Hozo's expanded Native longhands or IR enum order.

CSS rule emission order is not the entire cascade. The browser still applies
specificity, importance and platform property semantics. Native needs the
equivalent ordering of applicable writes, not merely a copy of emission rank.
In particular a selector's weight must not be inferred from the number of
runtime booleans: an authored expression guard has no CSS specificity.

`@hozo/tailwind` already exposes `loadClassOrder`/`loadProjectClassOrder` for
Web candidate sheets. That route is not yet a canonical plan for static Rust
lowering and Native candidate output. Upstream
[`getClassOrder`](https://github.com/tailwindlabs/tailwindcss/blob/v4.3.3/packages/tailwindcss/src/sort.ts)
assigns each class its **first generated rule's** position. That is useful for
existing single-rule candidates, not proof that one scalar can represent every
multi-rule utility. Preserve per-rule information where required.

## 3. Invariants

1. Preserve decision [009](../decisions/009-a-callers-class-sits-between-rest-and-state.md):
   component resting look, caller fallback, then component state; explicit
   JSX/spread style remains outside those tiers. Do not silently replace this
   cross-author contract with a global sort of all class names.
2. Preserve decision [011](../decisions/011-styling-inputs-keep-their-own-cascade.md):
   Tailwind orders its own input; StyleX retains its argument/atomic rules;
   assessed equal-weight inputs compose in JSX order. No Tailwind key on StyleX.
3. Root and secondary slots consume the same plan at their actual owners.
   Captured authored expressions retain evaluation order, count, short-circuit
   and coercion behavior. Sorting style writes must not execute author code.
4. Static, candidate and mixed resolution remain different execution routes,
   not different definitions of precedence. Missing state is not known false.
5. Keep current supported output/diagnostics for unassessed domains. Unknown
   precedence is explicit, not rank zero, a dropped declaration, or new refusal.
6. Text inheritance consumes the resolved frame. It does not carry an owner's
   specificity into descendants or repair a backend's cascade after the fact.

## 4. Canonical units and plan ownership

The following names are conceptual, not a new public API commitment:

```text
authored input + captured expression plan
  -> resolved utility units, retaining original candidate/rule identity
  -> common cascade planner + prepared ordering context
  -> ordered applicable-write plan
       -> Web selectors/rules
       -> Native StyleSheet entries and predicates
       -> generated candidate entries and compact ranks
```

A utility unit holds its input ID, candidate/rule ID, applicability predicate,
original rule signature, and declarations or references to them. Attach its
identity before expansion, deduplication, text-metric folding or register
resolution loses that identity. Derived writes retain their unit reference;
synthetic defaults remain distinguishable from explicit authored writes.
One candidate can own several rules; one rule can expand to several longhands.

Prefer compact IDs into a compilation-owned descriptor table over repeating
candidate strings/key vectors or allocating an Arc per declaration. The table
must survive child/text/slot adaptation for the entire IR lifetime; verify this
before choosing its ownership representation. Benchmark the representation,
including the common one-class case. This RFC does not mandate an arena rewrite
of unrelated IR or add runtime source-span/provenance objects.

The common planner lives in the compiler's shared Rust layer. It resolves
ordering before backend flattening using separate facts for composition tier,
frontend input boundary, assessed selector weight and frontend rule order.
Within a Tailwind input, a shared comparator consumes full rule signatures.
Across inputs, use decision 011 rather than comparing unrelated rank numbers.
StyleX supplies its already-resolved input ordering, not a reinterpreted key.

The result is an ordered sequence of guarded writes. Coalescing identical
predicates is legal only if it preserves this sequence's overwrite behavior;
never merge a later input backwards across an intervening write. Native must
not collect prop guards and pointer/focus conditions into separately appended
buckets that undo the plan's order. Backends may erase irrelevant metadata,
not reinterpret precedence.

### Project and standalone ordering contexts

- In project builds, prepare an immutable ordering context from the existing
  Tailwind design-system loader, actual theme and observed candidate/rule
  descriptors. Reuse that loader/cache; do not create an adapter-specific
  resolver or run it per component/render. Retain complete per-rule signatures
  when first-rule class ranks would lose information.
- Synchronous standalone Rust/WASM/default compiler calls use checked-in,
  generated builtin signature/variant facts and the same Rust comparator.
  No Node callback or Tailwind JS engine is required at runtime. A shared
  generator extracts full signatures for assessed rule shapes; new shapes need
  reference validation, not one hand-maintained sorter per family.
- Project and portable contexts record provenance, supported domain and a
  fingerprint. Compare keys only in a compatible context; a project rank is
  relative to its snapshot, not an immutable global number. Do not intermingle
  ranks from independently prepared candidate sets or versions.
- This does not require retaining every transform until the bundler graph is
  complete. Within one captured CSS/theme/version epoch, the assessed scalar
  comparator preserves existing rules' relative order when unrelated candidates
  are inserted. Complete module contexts may therefore emit rank-free static
  output independently; each generated resolver must compare only ranks from
  its own complete map. A finite batch still shares one exact context. Never
  merge rank tables or reuse output across stylesheet epochs. The
  [namespace-invariance evidence](../measurements/tailwind-namespace-invariance.md)
  supersedes final-global-namespace gating for this bounded default domain;
  actual adapter activation still needs delivered-output and cache checks.
- A statically resolved utility missing from the project's lexical scan must
  not receive a guessed rank. Its resolved descriptor must join preparation
  before emission, or use a complete compatible portable context for that
  domain. The integration spike must define this collect/prepare/emit boundary
  without parsing modules twice on every transform. No new async public compile
  API is assumed just to hide an unresolved dependency cycle.
- Cache keys include the schema/generator and Tailwind versions, relevant
  theme/import/custom-variant inputs, candidate universe and ordering policy.
  A changed snapshot invalidates dependent transforms and candidate modules,
  including Metro workers; an incremental addition may change existing ranks.
- An unavailable/unsupported descriptor stays explicit. Existing migration
  audit read-only/safe-loader constraints remain: ordering must not introduce
  execution of arbitrary project JS/config to make analysis succeed.

## 5. A small Native fallback, not a second planner

Build-time generation emits the prepared styles, predicate IDs, compact
relative ranks and any necessary assessed-conflict metadata. Runtime receives
data needed for the requested string, not CSS property-name heuristics, a
Tailwind parser or the full compiler ordering tuple.

On a class-string cache miss, look up requested entries and prepare their
ordered template once. Only that cache-fill step may sort. Existing owner
state updates select applicable entries from the cached template in order;
they do not reread rank metadata, stringify condition arrays or sort again.
Unranked overlap policies are described by build-time metadata, not a new
`padding`/`color`/`font` regex branch in the device resolver for every family.

Avoid an accumulating chain of positional optional arguments for each new
family. Specify one versioned internal generated-data contract after the
metadata-size spike, keeping existing supported resolver callers working or
providing an explicit compiler/engine ABI transition. No required public
provider, component registration or per-frame subscription is introduced.

Static-only output imports no new ordering helper. A resolver project with no
participating conflicts should not pay for a project-sized rank table. Measure
small-map and large-map strategies before deciding whether ordinal records or
another compact encoding is actually cheaper.

## 6. Platform normalization stays separate

Native logical/physical edge priority cannot be repaired by a class sort
alone. Normalize the ordered writes using the existing platform context:
direction-neutral px/mx pairs are a simple case; individual start/end sides
need direction-aware handling. Do not put logical-edge reset rules inside the
generic order comparator or freeze all unrelated utilities because one edge
is unassessed. Preserve Web writing-mode behavior; claim no new Native vertical
writing support. Runtime direction subscriptions remain out of scope.

Likewise font-size/line-height, implicit fallback registers, explicit leading
and transform composition retain their established dependency semantics.
Ordering metadata comes from the original rule; folding a default value must
not turn it into a later explicit write. Color opacity and arbitrary values
need descriptor/reference tests, not a special color-order runtime engine.

## 7. Acceptance and performance evidence before expansion

Use main `99e9c03a` as the immutable before revision, not failed #1237. Rebuild
each revision's addon before measuring it, with matching toolchains/profiles
and a captured fixture list. Do not compare a release binary with debug or
call CI wall-clock duration a compiler benchmark. Locally stay serial, CPU 1,
Idle; use CI for heavy applications, full reports and device work.

Correctness must compare against actual Tailwind output in a browser, then
against static Web, static Native selected styles and generated fallback.
Cover normal/reversed order and permutations where small; do not derive the
expected result from Hozo's new comparator. Include:

- spacing shorthand/axis/side, logical aliases and LTR/RTL;
- background/text colors, opacity modifiers and arbitrary values;
- font size plus explicit/default line-height, slash modifiers and weights;
- width/height and other single-rule controls, not only the motivating family;
- base and simultaneous owner states, assessed conjunctions, prop/ARIA/data
  predicates and media conditions as their domains are enabled;
- root/secondary, captured JS guards, StyleX input order, mixed caller/static
  tiers, explicit/spread style, nested text and unknown barriers.

Do not certify Native pixels/AT from a style-object comparison. Reuse targeted
device fixtures only where platform normalization or state delivery requires
them. Maintain existing conformance denominators/refusals and record any real
snapshot change; a new unsupported classification is not a coverage win.

Measure separately: cold project preparation; unchanged/incremental transforms;
parse/planning/lowering time and IR allocations/peak memory; candidate lookup
on cold strings, cached strings and repeated state changes; and generated
static/candidate module plus representative production bundle sizes. Use a
recorded small/medium/large candidate corpus and both repeated and many-unique
strings. Count ordering work/temporary allocations in the cache-hit/state paths
as well as timing them. The prior +636-byte module probe excludes rank tables
and is not an application-size or runtime-performance baseline.

Hot-path acceptance is structural: no new ordering sort/key reconstruction or
rank-table reads on cache hits/state-only updates; static output has no new
ordering runtime dependency. Cold/build costs must be reported with repeated
samples and spread. A repeatable >5% median slowdown in a representative
compile/cold-resolution workload triggers review of absolute time, affected
call count and cumulative project cost. It is not an automatic rejection of
tiny build-time differences, permission to weaken correctness, or a flaky
single-run CI threshold. The small-example acceptance above does not accept
arbitrary startup, project-wide or device-runtime regressions. Set actual payload
budgets from the first complete before/after bundle measurements; no unmeasured
zero-overhead or blanket speedup claim.

## 8. Implementation sequence and deletion targets

1. **Reference and cost baseline.** Add pinned upstream descriptors/browser
   cases and reproducible compile/candidate/bundle measurements. No production
   ordering change. Record which multi-rule/condition domains are not assessed.
2. **Unit identity and shared plan.** Retain utility/rule IDs before lossy
   lowering; establish the project/portable context boundary and pass-through
   plan. Existing production output remains the control. Validate source
   evaluations and cache invalidation before changing winners.
3. **Enable one complete shared slice.** Apply the plan to static Web/Native
   and candidate generation/resolution together, starting with assessed
   single-rule spacing, colors and sizing. Root and secondary slots share it.
   Do not land a Native-only order change or introduce a long-lived hidden
   experimental production route. Multi-rule text is not falsely counted done.
4. **Compound text and platform semantics.** Add validated full signatures for
   font/leading/register interactions and direction-aware alias normalization.
   Expand condition weights through the same plan where browser evidence
   proves them, rather than adding another late state-bucket sorter.
5. **Consolidate and graduate.** Delete equivalent ad-hoc ordering from parser,
   candidate output and resolver; retain one source of facts and one comparator.
   Keep platform transforms separate. Reconcile documentation/ADR wording only
   after the implementation and measurements support it; keep #1230 open for
   any remaining unassessed domains.

Use fresh main-based work, not a stack on #1237. Reuse its adversarial test
ideas as tests of the replacement, not its unmerged implementation as the
foundation. Existing merged owner/source ordering can remain during transition
but must not independently sort the same units once the common plan owns them.
Each layer must pass its own applicable CI before building a dependent layer.

## 9. Explicit non-goals and unresolved choices

This RFC does not implement arbitrary CSS/plugin compatibility on Native,
change the inheritance rollout, add theme/runtime subscriptions or make
unranked conditions magically comparable. Project-supported CSS constructs
must still pass Hozo's actual property/selector support checks.

The remaining design spikes are descriptor collection across synchronous
transforms, portable signature extraction for dynamic/multi-rule shapes, the
compact IR/runtime encoding and representative payload budgets. Their outcomes
must be recorded before enabling output changes. The architecture is the
shared unit/plan boundary; these representation choices are not settled ADRs.
