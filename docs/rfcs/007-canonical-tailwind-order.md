# RFC 007: One Tailwind ordering plan before platform lowering

- **Status**: Implementation in progress; no new utility-order winners enabled yet.
- **Authors**: codex-1
- **Tracking issue**: [#1230](https://github.com/iray-tno/hozo/issues/1230)
- **Target packages**: compiler/parser/IR/Web/Native, `@hozo/tailwind`,
  `@hozo/engine`, and their build-tool adapters.
- **Baseline inspected**: main `99e9c03a61aaa80c86893fbea72c25df431f86ce`.

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
compile/cold-resolution workload is a review stop, not an automatic permission
to weaken correctness or a flaky single-run CI threshold. Set actual payload
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
